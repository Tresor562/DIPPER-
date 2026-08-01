/**
 * utils/groupstats.js — 𝐃𝐚𝐫𝐤
 *
 * ╔══════════════════════════════════════════════════════════╗
 * ║  FIX CRITIQUE : fuite I/O disque                        ║
 * ║                                                          ║
 * ║  AVANT (BUGUÉ) :                                         ║
 * ║    addMessage() → readFileSync() + writeFileSync()       ║
 * ║    appelé sur CHAQUE message reçu → bloque l'event loop  ║
 * ║    sur un groupe actif = centaines d'écritures/min       ║
 * ║    → event loop saturée → bot arrête de répondre         ║
 * ║                                                          ║
 * ║  APRÈS (CORRIGÉ) :                                       ║
 * ║    Cache en mémoire (db variable module)                 ║
 * ║    Écriture sur disque toutes les 5 minutes max          ║
 * ║    (debounce + flush périodique)                         ║
 * ║    → zéro I/O bloquant pendant les messages              ║
 * ╚══════════════════════════════════════════════════════════╝
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/groupStats.json');

// ── Cache en mémoire (lecture unique au démarrage) ────────
let _cache      = null;
let _dirty      = false;
let _flushTimer = null;

const FLUSH_DELAY = 5 * 60 * 1000; // Écriture disque max toutes les 5 min

function getCache() {
  if (_cache !== null) return _cache;
  try {
    if (fs.existsSync(DB_PATH)) {
      _cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } else {
      _cache = {};
    }
  } catch {
    _cache = {};
  }
  return _cache;
}

function scheduleSave() {
  if (_flushTimer) return; // déjà programmé
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    if (!_dirty) return;
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(_cache, null, 2), 'utf8');
      _dirty = false;
    } catch (err) {
      console.error('[groupStats] flush error:', err.message);
    }
  }, FLUSH_DELAY);
}

// Flush forcé à la fermeture propre du process
process.on('exit', () => {
  if (_dirty && _cache) {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(_cache, null, 2), 'utf8'); } catch (_) {}
  }
});
process.on('SIGINT',  () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// ── API publique ──────────────────────────────────────────

function addMessage(groupId, senderId) {
  const db    = getCache();
  const today = new Date().toISOString().slice(0, 10);
  const hour  = String(new Date().getHours());

  if (!db[groupId])        db[groupId]        = {};
  if (!db[groupId][today]) db[groupId][today] = { total: 0, users: {}, hours: {} };

  const g = db[groupId][today];
  g.total++;
  g.users[senderId] = (g.users[senderId] || 0) + 1;
  g.hours[hour]     = (g.hours[hour]     || 0) + 1;

  _dirty = true;
  scheduleSave(); // écriture différée — ne bloque JAMAIS l'event loop
}

function getStats(groupId) {
  const db    = getCache();
  const today = new Date().toISOString().slice(0, 10);
  return db[groupId]?.[today] ?? null;
}

function getAllStats(groupId) {
  const db = getCache();
  return db[groupId] ?? {};
}

// Purge automatique des données de plus de 30 jours
// (1 fois par jour, non bloquant)
function purgeOldData() {
  const db      = getCache();
  const cutoff  = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  let changed = false;
  for (const gid of Object.keys(db)) {
    for (const day of Object.keys(db[gid])) {
      if (day < cutoffStr) {
        delete db[gid][day];
        changed = true;
      }
    }
  }
  if (changed) { _dirty = true; scheduleSave(); }
}

setInterval(purgeOldData, 24 * 60 * 60 * 1000);

module.exports = { addMessage, getStats, getAllStats };
