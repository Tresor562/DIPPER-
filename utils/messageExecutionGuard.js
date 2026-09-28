'use strict';

/**
 * Anti-double-exécution partagé par tous les chemins d'entrée WhatsApp
 * du même processus Node (socket legacy + SessionManager multi-session).
 *
 * Les listeners locaux de chaque socket gardent leur propre Map, donc ils
 * ne peuvent pas empêcher deux sockets du même compte de traiter le même
 * message. Cette Map vit dans un module singleton require() et constitue
 * le dernier verrou juste avant le moteur central handler.handleMessage().
 */

function positiveNumber(value, fallback, min) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

const TTL_MS = positiveNumber(
  process.env.WA_MESSAGE_EXECUTION_TTL_MS,
  30 * 60 * 1000,
  60_000
);
const MAX_ENTRIES = positiveNumber(
  process.env.WA_MESSAGE_EXECUTION_MAX_ENTRIES,
  20_000,
  1000
);

const claims = new Map();
let lastPruneAt = 0;

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function accountKey(sock) {
  const sessionPhone = digits(sock?._sessionPhoneNumber);
  if (sessionPhone) return sessionPhone;

  const rawUserId = String(sock?.user?.id || '');
  const localPart = rawUserId.split('@')[0].split(':')[0];
  return digits(localPart) || localPart || 'unknown';
}

function buildMessageExecutionKey(sock, msg) {
  const messageId = String(msg?.key?.id || '').trim();
  if (!messageId) return null;

  const remoteJid = String(msg?.key?.remoteJid || 'unknown');
  return `${accountKey(sock)}|${remoteJid}|${messageId}`;
}

function prune(now = Date.now()) {
  const cutoff = now - TTL_MS;

  for (const [key, ts] of claims) {
    if (ts < cutoff) claims.delete(key);
  }

  while (claims.size > MAX_ENTRIES) {
    const oldest = claims.keys().next().value;
    if (oldest === undefined) break;
    claims.delete(oldest);
  }

  lastPruneAt = now;
}

/**
 * Réserve atomiquement un message pour le premier handler qui le voit.
 * true = traiter ; false = doublon déjà réservé.
 */
function claimMessageExecution(sock, msg, now = Date.now()) {
  const key = buildMessageExecutionKey(sock, msg);
  if (!key) return true; // fail-open : ne jamais bloquer un message sans ID

  const previous = claims.get(key);
  if (Number.isFinite(previous) && now - previous < TTL_MS) {
    return false;
  }

  claims.set(key, now);

  // Nettoyage paresseux : aucun timer supplémentaire par session/processus.
  if (claims.size > MAX_ENTRIES || now - lastPruneAt >= 60_000) {
    prune(now);
  }

  return true;
}

function resetForTests() {
  claims.clear();
  lastPruneAt = 0;
}

module.exports = {
  claimMessageExecution,
  buildMessageExecutionKey,
  _resetForTests: resetForTests,
  _constants: { TTL_MS, MAX_ENTRIES },
};
