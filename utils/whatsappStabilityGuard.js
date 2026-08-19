'use strict';

const DEFAULT_MIN_GAP_MS = Number(process.env.WA_STABILITY_MIN_GAP_MS || 240);
const DEFAULT_CHAT_GAP_MS = Number(process.env.WA_STABILITY_CHAT_GAP_MS || 320);
const DEFAULT_MAX_QUEUE = Number(process.env.WA_STABILITY_MAX_QUEUE || 120);
const DEFAULT_SEND_RETRIES = Number(process.env.WA_STABILITY_SEND_RETRIES || 2);
const DEFAULT_RECONNECT_MAX_MS = Number(process.env.WA_STABILITY_RECONNECT_MAX_MS || 120000);
const DEFAULT_BURST_WINDOW_MS = Number(process.env.WA_STABILITY_BURST_WINDOW_MS || 10000);
const DEFAULT_BURST_SOFT_LIMIT = Number(process.env.WA_STABILITY_BURST_SOFT_LIMIT || 10);
const DEFAULT_CIRCUIT_FAILURES = Number(process.env.WA_STABILITY_CIRCUIT_FAILURES || 5);
const DEFAULT_CIRCUIT_MS = Number(process.env.WA_STABILITY_CIRCUIT_MS || 12000);

const states = new WeakMap();
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
  const jitter = 0.82 + Math.random() * 0.36;
  return Math.round(Math.min(base * serverPressure * jitter, DEFAULT_RECONNECT_MAX_MS));
}

function createState(sessionId) {
  return {
    sessionId,
    tail: Promise.resolve(),
    queued: 0,
    lastSentAt: 0,
    lastByJid: new Map(),
    burstByJid: new Map(),
    closed: false,
    consecutiveFailures: 0,
    circuitUntil: 0,
    stats: { sent: 0, relayed: 0, retried: 0, failed: 0, dropped: 0, burstDelayed: 0, circuitTrips: 0 },
  };
}

function getState(sock, sessionId) {
  if (!states.has(sock)) states.set(sock, createState(sessionId));
  return states.get(sock);
}

function shouldBypassQueue(payload) {
  // Accusés techniques légers seulement. Les médias/messages interactifs restent régulés.
  return !!(payload?.react || payload?.delete || payload?.protocolMessage);
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

function computeWait(state, jid) {
  const now = Date.now();
  const globalWait = Math.max(0, DEFAULT_MIN_GAP_MS - (now - state.lastSentAt));
  const lastChat = state.lastByJid.get(String(jid || 'unknown')) || 0;
  const chatWait = Math.max(0, DEFAULT_CHAT_GAP_MS - (now - lastChat));
  const burst = touchBurst(state, jid);
  const burstPenalty = burst > DEFAULT_BURST_SOFT_LIMIT
    ? Math.min(3500, (burst - DEFAULT_BURST_SOFT_LIMIT) * 180)
    : 0;
  if (burstPenalty) state.stats.burstDelayed++;
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

async function executeWithRetry(state, jid, fn, kind) {
  await waitCircuit(state);
  const wait = computeWait(state, jid);
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
      const retryAfter = Math.min(1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 400), 6000);
      await sleep(retryAfter);
      await waitCircuit(state);
    }
  }
  state.stats.failed++;
  throw lastErr;
}

function enqueue(state, jid, fn, kind) {
  if (state.closed) return Promise.reject(new Error('WhatsApp stability guard: socket fermé'));
  if (state.queued >= DEFAULT_MAX_QUEUE) {
    state.stats.dropped++;
    return Promise.reject(new Error(`WhatsApp stability guard: file pleine (${DEFAULT_MAX_QUEUE})`));
  }
  state.queued++;
  const task = async () => {
    try { return await executeWithRetry(state, jid, fn, kind); }
    finally { state.queued = Math.max(0, state.queued - 1); }
  };
  const run = state.tail.then(task, task);
  state.tail = run.catch(() => {});
  return run;
}

function installSendGuard(sock, sessionId = 'unknown') {
  if (!sock || typeof sock.sendMessage !== 'function') return sock;
  if (sock.__waStabilityGuardInstalled) return sock;

  const originalSend = sock.sendMessage.bind(sock);
  const originalRelay = typeof sock.relayMessage === 'function' ? sock.relayMessage.bind(sock) : null;
  const state = getState(sock, sessionId);

  sock.sendMessage = function guardedSendMessage(jid, payload, options) {
    if (state.closed) return Promise.reject(new Error('WhatsApp stability guard: socket fermé'));
    if (shouldBypassQueue(payload)) return originalSend(jid, payload, options);
    return enqueue(state, jid, () => originalSend(jid, payload, options), 'send');
  };

  if (originalRelay) {
    sock.relayMessage = function guardedRelayMessage(jid, message, options) {
      return enqueue(state, jid, () => originalRelay(jid, message, options), 'relay');
    };
  }

  Object.defineProperty(sock, '__waStabilityGuardInstalled', { value: true, enumerable: false });
  sock.__waStabilityState = state;
  sock.__waStabilityOriginalSendMessage = originalSend;
  sock.__waStabilityOriginalRelayMessage = originalRelay;
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

function getStats(sock) {
  const state = states.get(sock);
  if (!state) return null;
  return {
    sessionId: state.sessionId,
    queued: state.queued,
    circuitOpen: state.circuitUntil > Date.now(),
    circuitRemainingMs: Math.max(0, state.circuitUntil - Date.now()),
    consecutiveFailures: state.consecutiveFailures,
    ...state.stats,
  };
}

module.exports = {
  installSendGuard,
  markSocketClosed,
  markSocketOpen,
  reconnectDelay,
  getStats,
  isTransientSendError,
  isTerminalSessionError,
};
