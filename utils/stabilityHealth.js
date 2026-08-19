'use strict';

const whatsappStabilityGuard = require('./whatsappStabilityGuard');
const pairingGate = require('./pairingGate');

function sum(rows, key) {
  return rows.reduce((n, row) => n + Number(row?.[key] || 0), 0);
}

function buildAggregate(sessions = [], pairing = {}) {
  const stats = sessions.map(s => whatsappStabilityGuard.getStats(s?.sock)).filter(Boolean);
  const total = sessions.length;
  const online = sessions.filter(s => s?.isOnline).length;
  const registered = sessions.filter(s => s?.isRegistered).length;
  const circuitOpen = stats.filter(s => s.circuitOpen).length;
  const queued = sum(stats, 'queued');
  const failed = sum(stats, 'failed') + sum(stats, 'groupFailed');
  const status = circuitOpen > 0 || queued > 80 || (registered > 0 && online === 0) ? 'degraded' : 'ok';

  return {
    status,
    uptimeSec: Math.floor(process.uptime()),
    sessions: {
      total,
      online,
      offline: Math.max(0, total - online),
      registered,
    },
    transport: {
      queued,
      circuitOpen,
      sent: sum(stats, 'sent'),
      relayed: sum(stats, 'relayed'),
      retried: sum(stats, 'retried'),
      failed,
      dropped: sum(stats, 'dropped'),
      burstDelayed: sum(stats, 'burstDelayed'),
      mediaDelayed: sum(stats, 'mediaDelayed'),
      groupActions: sum(stats, 'groupActions'),
      groupBatches: sum(stats, 'groupBatches'),
      groupDelayed: sum(stats, 'groupDelayed'),
    },
    pairing: {
      active: Number(pairing.active || 0),
      maxConcurrent: Number(pairing.maxConcurrent || 0),
      lockedNumbers: Number(pairing.lockedNumbers || 0),
    },
    memory: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  };
}

function snapshot(sessionManager) {
  let sessions = [];
  try { sessions = sessionManager?.getAllSessions?.() || []; } catch (_) {}
  let pairing = {};
  try { pairing = pairingGate.stats(); } catch (_) {}
  return buildAggregate(sessions, pairing);
}

module.exports = { snapshot, buildAggregate };
