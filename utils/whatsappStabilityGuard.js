'use strict';

const DEFAULT_MIN_GAP_MS = Number(process.env.WA_STABILITY_MIN_GAP_MS || 220);
const DEFAULT_MAX_QUEUE = Number(process.env.WA_STABILITY_MAX_QUEUE || 120);
const DEFAULT_SEND_RETRIES = Number(process.env.WA_STABILITY_SEND_RETRIES || 2);
const DEFAULT_RECONNECT_MAX_MS = Number(process.env.WA_STABILITY_RECONNECT_MAX_MS || 120000);

const states = new WeakMap();

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function isTransientSendError(err) {
  const code = Number(err?.output?.statusCode || err?.statusCode || err?.status || 0);
  const msg = String(err?.message || err || '').toLowerCase();
  if ([408, 425, 429, 500, 502, 503, 504].includes(code)) return true;
  return /timed? out|timeout|temporar|rate.?over|too many|connection closed|socket closed|network|econnreset|econnrefused|etimedout/.test(msg);
}

function reconnectDelay(attempt = 0, statusCode = 0) {
  const n = Math.max(1, Number(attempt) || 1);
  const base = Math.min(3000 * Math.pow(1.65, n - 1), DEFAULT_RECONNECT_MAX_MS);
  const serverPressure = [429, 503].includes(Number(statusCode)) ? 1.8 : 1;
  const jitter = 0.82 + Math.random() * 0.36;
  return Math.round(Math.min(base * serverPressure * jitter, DEFAULT_RECONNECT_MAX_MS));
}

function getState(sock, sessionId) {
  if (!states.has(sock)) {
    states.set(sock, {
      sessionId,
      tail: Promise.resolve(),
      queued: 0,
      lastSentAt: 0,
      closed: false,
      stats: { sent: 0, retried: 0, failed: 0, dropped: 0 },
    });
  }
  return states.get(sock);
}

function shouldBypassQueue(payload) {
  // Les accusés techniques légers ne doivent pas être ralentis inutilement.
  return !!(payload?.react || payload?.delete || payload?.protocolMessage);
}

function installSendGuard(sock, sessionId = 'unknown') {
  if (!sock || typeof sock.sendMessage !== 'function') return sock;
  if (sock.__waStabilityGuardInstalled) return sock;

  const original = sock.sendMessage.bind(sock);
  const state = getState(sock, sessionId);

  sock.sendMessage = async function guardedSendMessage(jid, payload, options) {
    if (state.closed) throw new Error('WhatsApp stability guard: socket fermé');
    if (shouldBypassQueue(payload)) return original(jid, payload, options);
    if (state.queued >= DEFAULT_MAX_QUEUE) {
      state.stats.dropped++;
      throw new Error(`WhatsApp stability guard: file pleine (${DEFAULT_MAX_QUEUE})`);
    }

    state.queued++;
    const task = async () => {
      try {
        const wait = Math.max(0, DEFAULT_MIN_GAP_MS - (Date.now() - state.lastSentAt));
        if (wait) await sleep(wait);

        let lastErr;
        for (let attempt = 0; attempt <= DEFAULT_SEND_RETRIES; attempt++) {
          try {
            const result = await original(jid, payload, options);
            state.lastSentAt = Date.now();
            state.stats.sent++;
            return result;
          } catch (err) {
            lastErr = err;
            if (attempt >= DEFAULT_SEND_RETRIES || !isTransientSendError(err)) break;
            state.stats.retried++;
            await sleep(Math.min(900 * Math.pow(2, attempt) + Math.floor(Math.random() * 350), 5000));
          }
        }
        state.stats.failed++;
        throw lastErr;
      } finally {
        state.queued = Math.max(0, state.queued - 1);
      }
    };

    const run = state.tail.then(task, task);
    state.tail = run.catch(() => {});
    return run;
  };

  Object.defineProperty(sock, '__waStabilityGuardInstalled', { value: true, enumerable: false });
  sock.__waStabilityState = state;
  sock.__waStabilityOriginalSendMessage = original;
  return sock;
}

function markSocketClosed(sock) {
  const state = states.get(sock);
  if (state) state.closed = true;
}

function getStats(sock) {
  const state = states.get(sock);
  return state ? { queued: state.queued, ...state.stats } : null;
}

module.exports = {
  installSendGuard,
  markSocketClosed,
  reconnectDelay,
  getStats,
  isTransientSendError,
};
