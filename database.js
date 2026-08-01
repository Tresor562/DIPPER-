/**
 * database.js — 𝐃𝐚𝐫𝐤
 *
 * ╔══════════════════════════════════════════════════════════╗
 * ║  FIX CRITIQUE (conservé) : lecture disque à chaque commande║
 * ║    Cache en mémoire par fichier, écriture différée (2s)   ║
 * ║                                                            ║
 * ║  PHASE 1 — ISOLATION PAR SESSION (nouveau) :               ║
 * ║    Avant : database/groups.json (1 seul fichier, partagé   ║
 * ║            par TOUTES les sessions WhatsApp connectées)    ║
 * ║    Après : database/sessions/<sessionId>/groups.json       ║
 * ║            (1 dossier isolé par utilisateur/session)       ║
 * ║                                                            ║
 * ║  AUCUNE fonction exportée ne change de signature. Les 193  ║
 * ║  fichiers commands/*.js continuent d'appeler               ║
 * ║  require('../../database').getGroupSettings(jid) exactement║
 * ║  comme avant. Le sessionId courant est lu en interne via    ║
 * ║  utils/sessionContext.js (AsyncLocalStorage) — voir ce      ║
 * ║  fichier pour le détail du mécanisme.                      ║
 * ║                                                            ║
 * ║  MIGRATION : si database/sessions/default/ n'existe pas    ║
 * ║  encore et que d'anciens database/*.json (racine) existent,║
 * ║  ils sont copiés une seule fois vers sessions/default/ au   ║
 * ║  premier accès. Rien n'est supprimé côté racine (copie,     ║
 * ║  pas déplacement) — sécurité en cas de rollback.            ║
 * ╚══════════════════════════════════════════════════════════╝
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { getCurrentSessionId, DEFAULT_SESSION_ID } = require('./utils/sessionContext');

let config;
try   { config = require('./config'); }
catch { config = { defaultGroupSettings: {} }; }

const DB_ROOT     = path.join(process.cwd(), 'database');
const SESSIONS_ROOT = path.join(DB_ROOT, 'sessions');

const FILE_DEFAULTS = {
  groups:   {},
  users:    {},
  warnings: {},
  mods:     { moderators: [] },
  botState: { supremeReactionCount: 0 },
};

// ── Cache en mémoire, clé = chemin absolu résolu (donc déjà isolé par session) ──
const _cache  = {};
const _timers = {};
const DEBOUNCE = 2000;

let _legacyMigrationDone = false;

/**
 * Copie une seule fois les anciens fichiers globaux (database/*.json)
 * vers database/sessions/default/, si ce dossier n'existe pas encore.
 * N'écrase jamais rien : si sessions/default/ existe déjà, ne fait rien.
 */
function migrateLegacyRootOnce() {
  if (_legacyMigrationDone) return;
  _legacyMigrationDone = true;

  const defaultDir = path.join(SESSIONS_ROOT, DEFAULT_SESSION_ID);
  if (fs.existsSync(defaultDir)) return; // déjà migré (ou déjà une session "default" réelle)

  const legacyFiles = {
    groups:   path.join(DB_ROOT, 'groups.json'),
    users:    path.join(DB_ROOT, 'users.json'),
    warnings: path.join(DB_ROOT, 'warnings.json'),
    mods:     path.join(DB_ROOT, 'mods.json'),
    botState: path.join(DB_ROOT, 'botState.json'),
  };

  const hasLegacyData = Object.values(legacyFiles).some(f => fs.existsSync(f));
  if (!hasLegacyData) return; // rien à migrer (installation neuve)

  fs.mkdirSync(defaultDir, { recursive: true });
  for (const [name, legacyPath] of Object.entries(legacyFiles)) {
    const target = path.join(defaultDir, `${name}.json`);
    try {
      if (fs.existsSync(legacyPath)) {
        fs.copyFileSync(legacyPath, target);
        console.log(`[DB] Migration : ${name}.json → sessions/${DEFAULT_SESSION_ID}/`);
      }
    } catch (err) {
      console.error(`[DB] Échec migration ${name}.json:`, err.message);
    }
  }
}

/**
 * Résout le chemin du fichier `name` (groups|users|warnings|mods|botState)
 * pour la session courante (utils/sessionContext), en créant le dossier
 * et le fichier par défaut si nécessaire.
 */
function resolvePath(name) {
  migrateLegacyRootOnce();

  const sessionId = getCurrentSessionId();
  const dir = path.join(SESSIONS_ROOT, sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(FILE_DEFAULTS[name], null, 2));
  }
  return filePath;
}

function readDB(name) {
  const filePath = resolvePath(name);
  if (_cache[filePath] !== undefined) return _cache[filePath];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    _cache[filePath] = JSON.parse(raw);
  } catch {
    _cache[filePath] = { ...FILE_DEFAULTS[name] };
  }
  return _cache[filePath];
}

function writeDB(name, data) {
  const filePath = resolvePath(name);
  _cache[filePath] = data;
  if (_timers[filePath]) clearTimeout(_timers[filePath]);
  _timers[filePath] = setTimeout(() => {
    delete _timers[filePath];
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[DB] write error (${path.basename(filePath)}):`, err.message);
    }
  }, DEBOUNCE);
  return true;
}

// Flush tous les fichiers en attente à la fermeture
function flushAll() {
  for (const [filePath, timer] of Object.entries(_timers)) {
    clearTimeout(timer);
    delete _timers[filePath];
    try {
      if (_cache[filePath] !== undefined) {
        fs.writeFileSync(filePath, JSON.stringify(_cache[filePath], null, 2), 'utf-8');
      }
    } catch (_) {}
  }
}
process.on('exit',   flushAll);
process.on('SIGINT',  () => { flushAll(); process.exit(0); });
process.on('SIGTERM', () => { flushAll(); process.exit(0); });

// ── Group Settings ────────────────────────────────────────
const getGroupSettings = (groupId) => {
  const groups = readDB('groups');
  if (!groups[groupId]) {
    groups[groupId] = { ...(config.defaultGroupSettings || {}) };
    writeDB('groups', groups);
  }
  return groups[groupId];
};

const updateGroupSettings = (groupId, settings) => {
  const groups = readDB('groups');
  groups[groupId] = { ...(groups[groupId] || {}), ...settings };
  return writeDB('groups', groups);
};

// ── État persistant du bot (compteurs divers) ──────────────
const getNextSupremeReactionCount = () => {
  const state = readDB('botState');
  state.supremeReactionCount = (state.supremeReactionCount || 0) + 1;
  writeDB('botState', state);
  return state.supremeReactionCount;
};

// ── Users ─────────────────────────────────────────────────
const getUser = (userId) => {
  const users = readDB('users');
  const key = String(userId).split('@')[0].split(':')[0];
  return users[key] || null;
};

const updateUser = (userId, data) => {
  const users = readDB('users');
  const key = String(userId).split('@')[0].split(':')[0];
  users[key] = { ...(users[key] || {}), ...data };
  return writeDB('users', users);
};

const getAllUsers = () => {
  const users = readDB('users');
  return Object.keys(users).map(id => ({ id, ...users[id] }));
};

// ── Warnings ──────────────────────────────────────────────
const getWarnings = (userId, groupId) => {
  const warnings = readDB('warnings');
  const key = `${groupId}_${userId}`;
  return warnings[key] || { count: 0, reasons: [] };
};

const addWarning = (userId, groupId, reason = '') => {
  const warnings = readDB('warnings');
  const key = `${groupId}_${userId}`;
  if (!warnings[key]) warnings[key] = { count: 0, reasons: [] };
  warnings[key].count++;
  if (reason) warnings[key].reasons.push({ reason, date: Date.now() });
  writeDB('warnings', warnings);
  return warnings[key].count;
};

const resetWarnings = (userId, groupId) => {
  const warnings = readDB('warnings');
  const key = `${groupId}_${userId}`;
  delete warnings[key];
  return writeDB('warnings', warnings);
};

// ── Moderators ────────────────────────────────────────────
const getModerators = () => {
  const mods = readDB('mods');
  return mods.moderators || [];
};

const addModerator = (userId) => {
  const mods = readDB('mods');
  if (!mods.moderators) mods.moderators = [];
  const num = userId.split('@')[0].split(':')[0];
  if (!mods.moderators.includes(num)) {
    mods.moderators.push(num);
    writeDB('mods', mods);
  }
  return true;
};

const removeModerator = (userId) => {
  const mods = readDB('mods');
  const num  = userId.split('@')[0].split(':')[0];
  mods.moderators = (mods.moderators || []).filter(m => m !== num);
  return writeDB('mods', mods);
};

const isModerator = (userId) => {
  const num  = String(userId).split('@')[0].split(':')[0];
  return getModerators().includes(num);
};

// ── Sudo ──────────────────────────────────────────────────
const getSudoUser = (userId) => {
  const users = readDB('users');
  const num   = String(userId).split('@')[0].split(':')[0];
  return users[num] || null;
};

const getUserSettings = (chatId) => {
  const users = readDB('users');
  return users[chatId] || {};
};

// ── Ghostg mode (NLP toggle) — PHASE 2 : isolé par session ────
// Avant : global.ghostgMode / config.ghostgMode / fichier .env — un seul
// interrupteur partagé par TOUTES les sessions (bug d'isolation prouvé,
// cf. IMPLEMENTATION_STATUS.md Phase 2). Stocké maintenant dans le même
// botState.json déjà isolé par session depuis la Phase 1 — aucun nouveau
// mécanisme de stockage inventé.
const getGhostgMode = () => {
  const state = readDB('botState');
  if (state.ghostgMode === undefined) {
    state.ghostgMode = (config.ghostgMode || 'on');
  }
  return state.ghostgMode;
};

const setGhostgMode = (value) => {
  const state = readDB('botState');
  state.ghostgMode = value;
  return writeDB('botState', state);
};

module.exports = {
  getGroupSettings,
  updateGroupSettings,
  getNextSupremeReactionCount,
  getGhostgMode,
  setGhostgMode,
  getUser,
  updateUser,
  getAllUsers,
  getWarnings,
  addWarning,
  resetWarnings,
  getModerators,
  addModerator,
  removeModerator,
  isModerator,
  getSudoUser,
  getUserSettings,
};
