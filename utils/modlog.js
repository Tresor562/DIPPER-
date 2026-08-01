/**
 * utils/modlog.js — 𝐃𝐚𝐫𝐤
 *
 * Source officielle unique du journal administratif (modlog).
 * Toute commande souhaitant enregistrer une action de modération
 * doit importer ce module — jamais commands/group_management/modlog.js
 * directement (qui n'est qu'une interface d'affichage).
 *
 * Stockage : un fichier JSON par groupe dans data/modlogs/.
 * Écriture synchrone : fréquence des actions de modération très faible
 * par rapport aux messages (contrairement à utils/groupstats.js qui est
 * appelé sur chaque message et nécessite un cache différé), donc pas
 * besoin d'un système de debounce ici.
 *
 * addEntry() n'échoue jamais bruyamment : une panne d'écriture du
 * journal ne doit jamais casser la commande de modération appelante
 * (promote/demote/exil/delete...).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const sessionContext = require('./sessionContext');

const LOG_ROOT = path.join(__dirname, '..', 'data', 'modlogs');

// Limite par groupe. 300 entrées couvrent plusieurs mois d'activité de
// modération normale pour un groupe actif, tout en gardant un fichier
// JSON léger (quelques dizaines de Ko max) et une lecture instantanée.
const MAX_ENTRIES = 300;

// [PHASE 2] Isolation par session : avant, un seul dossier data/modlogs/
// partagé par TOUTES les sessions — les journaux de modération de tous
// les utilisateurs du serveur se mélangeaient dans le même répertoire.
// Chaque session a maintenant son propre sous-dossier.
function sessionDir() {
  return path.join(LOG_ROOT, sessionContext.getCurrentSessionId());
}

let _legacyMigrationDone = false;

function migrateLegacyRootOnce() {
  if (_legacyMigrationDone) return;
  _legacyMigrationDone = true;
  try {
    if (sessionContext.getCurrentSessionId() !== sessionContext.DEFAULT_SESSION_ID) return;
    const defaultDir = sessionDir();
    if (fs.existsSync(defaultDir)) return; // déjà migré

    if (!fs.existsSync(LOG_ROOT)) return;
    const rootEntries = fs.readdirSync(LOG_ROOT, { withFileTypes: true });
    const legacyFiles = rootEntries.filter(e => e.isFile() && e.name.endsWith('.json'));
    if (legacyFiles.length === 0) return;

    fs.mkdirSync(defaultDir, { recursive: true });
    for (const entry of legacyFiles) {
      fs.copyFileSync(path.join(LOG_ROOT, entry.name), path.join(defaultDir, entry.name));
    }
    console.log(`[modlog] Migration : ${legacyFiles.length} journal(aux) → modlogs/${sessionContext.DEFAULT_SESSION_ID}/`);
  } catch (err) {
    console.error('[modlog] migration échouée:', err.message);
  }
}

function ensureDir() {
  migrateLegacyRootOnce();
  const dir = sessionDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function logPath(groupId) {
  migrateLegacyRootOnce();
  return path.join(sessionDir(), `${String(groupId).replace(/[^a-z0-9]/gi, '_')}.json`);
}

function loadLog(groupId) {
  try {
    const p = logPath(groupId);
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

function saveLog(groupId, entries) {
  try {
    ensureDir();
    const toSave = entries.slice(-MAX_ENTRIES);
    fs.writeFileSync(logPath(groupId), JSON.stringify(toSave, null, 2), 'utf8');
  } catch (err) {
    console.error('[modlog] écriture échouée:', err.message);
  }
}

/**
 * Enregistre une action de modération.
 * @param {string} groupId - JID du groupe
 * @param {string} action  - ex: 'promote', 'demote', 'kick', 'delete'
 * @param {object} opts
 * @param {string} [opts.by]        - JID de l'auteur de l'action
 * @param {string} [opts.target]    - JID de la cible (si applicable)
 * @param {string} [opts.reason]    - raison éventuelle
 * @param {string} [opts.groupName] - nom du groupe au moment de l'action
 */
function addEntry(groupId, action, opts = {}) {
  try {
    if (!groupId || !action) return;
    const { by, target, reason, groupName } = opts;

    const entries = loadLog(groupId);
    entries.push({
      action,
      by       : by     || 'inconnu',
      target   : target || null,
      reason   : reason || null,
      groupId,
      groupName: groupName || null,
      timestamp: Date.now(),
    });
    saveLog(groupId, entries);
  } catch (err) {
    console.error('[modlog] addEntry échouée:', err.message);
  }
}

/**
 * Lit les entrées d'un groupe, les plus récentes en dernier.
 * @param {string} groupId
 * @param {number} [limit] - si fourni, ne renvoie que les `limit` dernières entrées
 */
function getEntries(groupId, limit) {
  const entries = loadLog(groupId);
  if (!limit) return entries;
  return entries.slice(-limit);
}

module.exports = { addEntry, getEntries };
