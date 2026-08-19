'use strict';

const DEFAULT_MIN_GAP_MS = Number(process.env.WA_STABILITY_MIN_GAP_MS || 240);
const DEFAULT_CHAT_GAP_MS = Number(process.env.WA_STABILITY_CHAT_GAP_MS || 320);
const DEFAULT_MEDIA_GAP_MS = Number(process.env.WA_STABILITY_MEDIA_GAP_MS || 850);
const DEFAULT_MAX_QUEUE = Number(process.env.WA_STABILITY_MAX_QUEUE || 120);
const DEFAULT_SEND_RETRIES = Number(process.env.WA_STABILITY_SEND_RETRIES || 2);
const DEFAULT_RECONNECT_MAX_MS = Number(process.env.WA_STABILITY_RECONNECT_MAX_MS || 120000);
const DEFAULT_BURST_WINDOW_MS = Number(process.env.WA_STABILITY_BURST_WINDOW_MS || 10000);
const DEFAULT_BURST_SOFT_LIMIT = Number(process.env.WA_STABILITY_BURST_SOFT_LIMIT || 10);
const DEFAULT_CIRCUIT_FAILURES = Number(process.env.WA_STABILITY_CIRCUIT_FAILURES || 5);
const DEFAULT_CIRCUIT_MS = Number(process.env.WA_STABILITY_CIRCUIT_MS || 12000);
const DEFAULT_GROUP_CHUNK = Math.max(1, Number(process.env.WA_STABILITY_GROUP_CHUNK || 8));
const DEFAULT_GROUP_GAP_MS = Math.max(0, Number(process.env.WA_STABILITY_GROUP_GAP_MS || 1200));
const DEFAULT_GROUP_RETRIES = Math.max(0, Number(process.env.WA_STABILITY_GROUP_RETRIES || 1));
const DEFAULT_RESTORE_GAP_MS = Math.max(0, Number(process.env.WA_STABILITY_RESTORE_GAP_MS || 450));

const states = new WeakMap();
let restoreTail = Promise.resolve();
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function jitter(ms, spread = 0.2) { return Math.max(0, Math.round(ms * (1 - spread + Math.random() * spread * 2))); }

function statusCodeOf(err) {
  return Number(err?.output?.statusCode || err?.statusCode || err?.status || err?.data?.statusCode || 0);
}

function isTransientSendError(err) {
  const code = statusCodeOf(err);
  const msg = String(err?.message || err || '').toLowerCase();
  if ([408, 425, 429, 500, 502, 503, 504].includes(code)) return true;
  return /timed? out|timeout|temporar|rate.?over|too many|connection closed|socket closed|network|econnreset|econnrefused|etimedout/.test(msg);
}

function isTerminalSessionError(err) {
  const code = statusCodeOf(err);
  const msg = String(err?.message || err || '').toLowerCase();
  return [401, 403, 409, 440].includes(code) || /logged.?out|bad session|connection replaced|conflict|invalid session|not authorized/.test(msg);
}

function reconnectDelay(attempt = 0, statusCode = 0) {
  const n = Math.max(1, Number(attempt) || 1);
  const base = Math.min(3000 * Math.pow(1.65, n - 1), DEFAULT_RECONNECT_MAX_MS);
  const serverPressure = [429, 503].includes(Number(statusCode)) ? 1.8 : 1;
  return Math.round(Math.min(base * serverPressure * (0.82 + Math.random() * 0.36), DEFAULT_RECONNECT_MAX_MS));
}

function createState(sessionId) {
  return {
    sessionId,
    tail: Promise.resolve(),
    groupTailByJid: new Map(),
    queued: 0,
    lastSentAt: 0,
    lastByJid: new Map(),
    burstByJid: new Map(),
    closed: false,
    consecutiveFailures: 0,
    circuitUntil: 0,
    stats: {
      sent: 0, relayed: 0, retried: 0, failed: 0, dropped: 0,
      burstDelayed: 0, circuitTrips: 0, mediaDelayed: 0,
      groupActions: 0, groupBatches: 0, groupDelayed: 0, groupFailed: 0,
      requestActions: 0,
    },
  };
}

function getState(sock, sessionId) {
  if (!states.has(sock)) states.set(sock, createState(sessionId));
  return states.get(sock);
}

function shouldBypassQueue(payload) {
  return !!(payload?.react || payload?.delete || payload?.protocolMessage);
}

function isMediaPayload(payload) {
  return !!(payload?.image || payload?.video || payload?.audio || payload?.document || payload?.sticker || payload?.ptv);
}

function touchBurst(state, jid) {
  const now = Date.now();
  const key = String(jid || 'unknown');
  let row = state.burstByJid.get(key);
  if (!row || now - row.startedAt >= DEFAULT_BURST_WINDOW_MS) row = { startedAt: now, count: 0 };
  row.count++;
  state.burstByJid.set(key, row);
  if (state.burstByJid.size > 1000) {
    for (const [k, v] of state.burstByJid) if (now - v.startedAt > DEFAULT_BURST_WINDOW_MS * 2) state.burstByJid.delete(k);
  }
  return row.count;
}

function computeWait(state, jid, { media = false } = {}) {
  const now = Date.now();
  const globalWait = Math.max(0, DEFAULT_MIN_GAP_MS - (now - state.lastSentAt));
  const lastChat = state.lastByJid.get(String(jid || 'unknown')) || 0;
  const desiredChatGap = media ? Math.max(DEFAULT_CHAT_GAP_MS, DEFAULT_MEDIA_GAP_MS) : DEFAULT_CHAT_GAP_MS;
  const chatWait = Math.max(0, desiredChatGap - (now - lastChat));
  const burst = touchBurst(state, jid);
  const burstPenalty = burst > DEFAULT_BURST_SOFT_LIMIT ? Math.min(3500, (burst - DEFAULT_BURST_SOFT_LIMIT) * 180) : 0;
  if (burstPenalty) state.stats.burstDelayed++;
  if (media && chatWait > DEFAULT_CHAT_GAP_MS) state.stats.mediaDelayed++;
  return Math.max(globalWait, chatWait, burstPenalty);
}

function tripCircuit(state) {
  state.circuitUntil = Date.now() + DEFAULT_CIRCUIT_MS;
  state.stats.circuitTrips++;
}

async function waitCircuit(state) {
  const wait = state.circuitUntil - Date.now();
  if (wait > 0) await sleep(wait);
}

async function executeWithRetry(state, jid, fn, kind, meta = {}) {
  await waitCircuit(state);
  const wait = computeWait(state, jid, meta);
  if (wait) await sleep(wait);
  let lastErr;
  for (let attempt = 0; attempt <= DEFAULT_SEND_RETRIES; attempt++) {
    try {
      const result = await fn();
      const now = Date.now();
      state.lastSentAt = now;
      state.lastByJid.set(String(jid || 'unknown'), now);
      state.consecutiveFailures = 0;
      if (kind === 'relay') state.stats.relayed++;
      else state.stats.sent++;
      return result;
    } catch (err) {
      lastErr = err;
      state.consecutiveFailures++;
      if (isTerminalSessionError(err)) break;
      if (state.consecutiveFailures >= DEFAULT_CIRCUIT_FAILURES) tripCircuit(state);
      if (attempt >= DEFAULT_SEND_RETRIES || !isTransientSendError(err)) break;
      state.stats.retried++;
      await sleep(Math.min(1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 400), 6000));
      await waitCircuit(state);
    }
  }
  state.stats.failed++;
  throw lastErr;
}

function enqueue(state, jid, fn, kind, meta) {
  if (state.closed) return Promise.reject(new Error('WhatsApp stability guard: socket fermé'));
  if (state.queued >= DEFAULT_MAX_QUEUE) {
    state.stats.dropped++;
    return Promise.reject(new Error(`WhatsApp stability guard: file pleine (${DEFAULT_MAX_QUEUE})`));
  }
  state.queued++;
  const task = async () => {
    try { return await executeWithRetry(state, jid, fn, kind, meta); }
    finally { state.queued = Math.max(0, state.queued - 1); }
  };
  const run = state.tail.then(task, task);
  state.tail = run.catch(() => {});
  return run;
}

function chunkParticipants(participants, size = DEFAULT_GROUP_CHUNK) {
  const list = Array.isArray(participants) ? participants.filter(Boolean) : [];
  const out = [];
  for (let i = 0; i < list.length; i += Math.max(1, size)) out.push(list.slice(i, i + Math.max(1, size)));
  return out;
}

async function runGroupBatch(state, groupJid, batch, action, fn, kind) {
  let lastErr;
  for (let attempt = 0; attempt <= DEFAULT_GROUP_RETRIES; attempt++) {
    try {
      const result = await fn(batch, action);
      state.stats.groupBatches++;
      state.stats.groupActions += batch.length;
      if (kind === 'request') state.stats.requestActions += batch.length;
      return result;
    } catch (err) {
      lastErr = err;
      if (isTerminalSessionError(err) || attempt >= DEFAULT_GROUP_RETRIES || !isTransientSendError(err)) break;
      state.stats.retried++;
      await sleep(jitter(1200 * (attempt + 1)));
    }
  }
  state.stats.groupFailed += batch.length;
  throw lastErr;
}

function enqueueGroupOperation(state, groupJid, participants, action, fn, kind = 'participants') {
  if (state.closed) return Promise.reject(new Error('WhatsApp stability guard: socket fermé'));
  const key = String(groupJid || 'unknown');
  const batches = chunkParticipants(participants);
  const previous = state.groupTailByJid.get(key) || Promise.resolve();
  const task = async () => {
    const allResults = [];
    for (let i = 0; i < batches.length; i++) {
      if (state.closed) throw new Error('WhatsApp stability guard: socket fermé');
      const result = await runGroupBatch(state, key, batches[i], action, fn, kind);
      if (Array.isArray(result)) allResults.push(...result);
      else if (result !== undefined) allResults.push(result);
      if (i < batches.length - 1 && DEFAULT_GROUP_GAP_MS > 0) {
        state.stats.groupDelayed++;
        await sleep(jitter(DEFAULT_GROUP_GAP_MS));
      }
    }
    return allResults;
  };
  const run = previous.then(task, task);
  state.groupTailByJid.set(key, run.catch(() => {}));
  run.finally(() => {
    const current = state.groupTailByJid.get(key);
    if (current === run || current === run.catch?.(() => {})) state.groupTailByJid.delete(key);
  }).catch(() => {});
  return run;
}

function installSendGuard(sock, sessionId = 'unknown') {
  if (!sock || typeof sock.sendMessage !== 'function') return sock;
  if (sock.__waStabilityGuardInstalled) return sock;

  const originalSend = sock.sendMessage.bind(sock);
  const originalRelay = typeof sock.relayMessage === 'function' ? sock.relayMessage.bind(sock) : null;
  const originalGroupUpdate = typeof sock.groupParticipantsUpdate === 'function' ? sock.groupParticipantsUpdate.bind(sock) : null;
  const originalRequestUpdate = typeof sock.groupRequestParticipantsUpdate === 'function' ? sock.groupRequestParticipantsUpdate.bind(sock) : null;
  const state = getState(sock, sessionId);

  sock.sendMessage = function guardedSendMessage(jid, payload, options) {
    if (state.closed) return Promise.reject(new Error('WhatsApp stability guard: socket fermé'));
    if (shouldBypassQueue(payload)) return originalSend(jid, payload, options);
    return enqueue(state, jid, () => originalSend(jid, payload, options), 'send', { media: isMediaPayload(payload) });
  };

  if (originalRelay) {
    sock.relayMessage = function guardedRelayMessage(jid, message, options) {
      return enqueue(state, jid, () => originalRelay(jid, message, options), 'relay', { media: true });
    };
  }

  if (originalGroupUpdate) {
    sock.groupParticipantsUpdate = function guardedGroupParticipantsUpdate(groupJid, participants, action) {
      return enqueueGroupOperation(state, groupJid, participants, action,
        (batch, act) => originalGroupUpdate(groupJid, batch, act), 'participants');
    };
  }

  if (originalRequestUpdate) {
    sock.groupRequestParticipantsUpdate = function guardedGroupRequestParticipantsUpdate(groupJid, participants, action) {
      return enqueueGroupOperation(state, groupJid, participants, action,
        (batch, act) => originalRequestUpdate(groupJid, batch, act), 'request');
    };
  }

  Object.defineProperty(sock, '__waStabilityGuardInstalled', { value: true, enumerable: false });
  sock.__waStabilityState = state;
  sock.__waStabilityOriginalSendMessage = originalSend;
  sock.__waStabilityOriginalRelayMessage = originalRelay;
  sock.__waStabilityOriginalGroupParticipantsUpdate = originalGroupUpdate;
  sock.__waStabilityOriginalGroupRequestParticipantsUpdate = originalRequestUpdate;
  return sock;
}

function markSocketClosed(sock) {
  const state = states.get(sock);
  if (state) state.closed = true;
}

function markSocketOpen(sock) {
  const state = states.get(sock);
  if (!state) return;
  state.closed = false;
  state.consecutiveFailures = 0;
  state.circuitUntil = 0;
}

function waitRestoreSlot() {
  const task = async () => {
    if (DEFAULT_RESTORE_GAP_MS > 0) await sleep(jitter(DEFAULT_RESTORE_GAP_MS, 0.35));
  };
  const run = restoreTail.then(task, task);
  restoreTail = run.catch(() => {});
  return run;
}

function getStats(sock) {
  const state = states.get(sock);
  if (!state) return null;
  return {
    sessionId: state.sessionId,
    queued: state.queued,
    circuitOpen: state.circuitUntil > Date.now(),
    circuitRemainingMs: Math.max(0, state.circuitUntil - Date.now()),
    consecutiveFailures: state.consecutiveFailures,
    groupQueues: state.groupTailByJid.size,
    ...state.stats,
  };
}

module.exports = {
  installSendGuard,
  markSocketClosed,
  markSocketOpen,
  reconnectDelay,
  waitRestoreSlot,
  getStats,
  chunkParticipants,
  isTransientSendError,
  isTerminalSessionError,
};
