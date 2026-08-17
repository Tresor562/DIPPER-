'use strict';

// Coordonne les redéploiements sans transformer un redémarrage Render en
// erreur utilisateur. Les mises à jour HOT de commandes n'utilisent pas ce
// chemin et restent sans coupure de socket. Pour un redéploiement du coeur,
// l'API reste joignable, les demandes /pair attendent la fin de restauration,
// et SIGTERM draine les requêtes avant de fermer proprement les sockets.

const state = {
  phase: 'booting', // booting | ready | draining
  since: Date.now(),
  readyAt: 0,
  reason: 'startup',
  inflight: 0,
  waiters: new Set(),
  server: null,
  shutdownInstalled: false,
};

function snapshot() {
  return {
    phase: state.phase,
    ready: state.phase === 'ready',
    draining: state.phase === 'draining',
    since: state.since,
    readyAt: state.readyAt || null,
    inflight: state.inflight,
    reason: state.reason,
  };
}

function resolveWaiters(value) {
  for (const waiter of Array.from(state.waiters)) {
    try { waiter(value); } catch (_) {}
  }
  state.waiters.clear();
}

function markBooting(reason = 'startup') {
  state.phase = 'booting';
  state.since = Date.now();
  state.readyAt = 0;
  state.reason = reason;
}

function markReady(reason = 'runtime-ready') {
  if (state.phase === 'draining') return;
  state.phase = 'ready';
  state.readyAt = Date.now();
  state.reason = reason;
  resolveWaiters(true);
  console.log('[continuity] ✅ runtime prêt — nouvelles demandes admises');
}

function markDraining(reason = 'deploy-shutdown') {
  state.phase = 'draining';
  state.since = Date.now();
  state.reason = reason;
  resolveWaiters(false);
  console.log('[continuity] 🔄 drainage de déploiement activé');
}

async function waitForOperational(timeoutMs = 90_000) {
  if (state.phase === 'ready') return true;
  if (state.phase === 'draining') return false;
  return new Promise(resolve => {
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      state.waiters.delete(finish);
      resolve(value);
    };
    const timer = setTimeout(() => finish(state.phase === 'ready'), timeoutMs);
    if (timer.unref) timer.unref();
    state.waiters.add(finish);
  });
}

async function track(task) {
  state.inflight += 1;
  try { return await task(); }
  finally { state.inflight = Math.max(0, state.inflight - 1); }
}

async function waitForInflight(timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (state.inflight > 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return state.inflight === 0;
}

function attachServer(server) {
  state.server = server || null;
}

// /health reste HTTP 200 pendant booting : Render peut mettre la nouvelle
// instance en ligne immédiatement, tandis que /pair attend réellement ready.
// En draining on renvoie 503 afin que le proxy cesse d'envoyer de nouvelles
// requêtes à l'ancienne instance avant sa fermeture.
function health() {
  const body = { status: state.phase === 'draining' ? 'draining' : 'ok', ...snapshot() };
  return { statusCode: state.phase === 'draining' ? 503 : 200, body };
}

function installShutdown(cleanup, opts = {}) {
  if (state.shutdownInstalled) return;
  state.shutdownInstalled = true;
  const lbGraceMs = opts.lbGraceMs ?? 1500;
  const hardTimeoutMs = opts.hardTimeoutMs ?? 24_000;
  let running = false;

  const shutdown = async signal => {
    if (running) return;
    running = true;
    markDraining(signal || 'shutdown');

    const hard = setTimeout(() => {
      console.error('[continuity] délai de shutdown dépassé — sortie forcée');
      process.exit(0);
    }, hardTimeoutMs);

    try {
      // Laisser le healthcheck 503 se propager au load balancer avant de
      // refuser les nouvelles connexions HTTP.
      await new Promise(resolve => setTimeout(resolve, lbGraceMs));
      if (state.server?.close) {
        await new Promise(resolve => {
          try { state.server.close(() => resolve()); }
          catch (_) { resolve(); }
          setTimeout(resolve, 3000).unref?.();
        });
      }
      await waitForInflight(12_000);
      if (typeof cleanup === 'function') await cleanup(signal);
    } catch (err) {
      console.error('[continuity] nettoyage shutdown:', err.message);
    } finally {
      clearTimeout(hard);
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
  snapshot,
  markBooting,
  markReady,
  markDraining,
  waitForOperational,
  track,
  waitForInflight,
  attachServer,
  health,
  installShutdown,
};
