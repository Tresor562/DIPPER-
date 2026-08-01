/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐈𝐏𝐏𝐄𝐑 — Auth State Fichiers pour Baileys Multi-Sessions ║
 * ║   utils/fileAuthState.js                                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *   [Chantier "Architecture hybride"] Remplace utils/mongoAuth.js pour le
 *   stockage des credentials WhatsApp (creds.json, keys, app-state-sync-keys)
 *   du mode multi-session. Chaque session possède désormais son propre
 *   dossier local, comme demandé :
 *
 *     sessions/
 *     ├── session_22912345678/
 *     ├── session_33698765432/
 *     └── ...
 *
 * CHOIX TECHNIQUE — réutiliser useMultiFileAuthState natif de Baileys
 * (au lieu de réécrire un fournisseur maison comme mongoAuth.js avait dû
 * le faire pour Mongo) :
 *   - Déjà une dépendance du projet (@whiskeysockets/baileys), déjà
 *     utilisée en mode mono-session dans index.js — donc déjà prouvée
 *     compatible avec la version Baileys de ce projet.
 *   - Gère lui-même toute la sérialisation BufferJSON des clés (pre-keys,
 *     session keys, app-state-sync-keys) — c'est exactement la partie la
 *     plus délicate à reproduire correctement à la main (mongoAuth.js
 *     avait dû le faire pour Mongo ; ici, aucune réimplémentation).
 *   - Suit automatiquement les futures mises à jour de Baileys, plutôt que
 *     de maintenir un fournisseur parallèle qui pourrait diverger.
 *
 * CE FICHIER NE CONTIENT AUCUNE LOGIQUE MÉTIER DE PAIRING :
 *   Uniquement la gestion des dossiers/fichiers de credentials. La logique
 *   de session (connexion, reconnexion, etc.) reste dans sessionManager.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');

// Racine de tous les dossiers de sessions multi-utilisateurs — distincte du
// dossier SESSION_NAME (mono-session, inchangé) pour ne jamais mélanger les
// deux modes.
const SESSIONS_ROOT = path.join(process.cwd(), 'sessions');

/**
 * Retourne le chemin absolu du dossier local d'une session.
 * @param {string} sessionId ex: 'session_22912345678'
 * @returns {string}
 */
function getSessionDir(sessionId) {
  return path.join(SESSIONS_ROOT, sessionId);
}

/**
 * Indique si un dossier de credentials existe déjà pour cette session
 * (donc si des creds sont potentiellement rechargeables).
 * @param {string} sessionId
 * @returns {boolean}
 */
function sessionDirExists(sessionId) {
  const dir = getSessionDir(sessionId);
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, 'creds.json'));
}

/**
 * Charge (ou crée) l'auth state fichiers d'une session — même contrat que
 * utils/mongoAuth.js::useMongoAuthState (state + saveCreds), pour rester un
 * remplacement direct côté sessionManager.js.
 * @param {string} sessionId
 * @returns {Promise<{ state: object, saveCreds: Function }>}
 */
async function useFileAuthState(sessionId) {
  const dir = getSessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  return { state, saveCreds };
}

/**
 * Supprime définitivement le dossier de credentials d'une session.
 * Appelé quand un utilisateur se déconnecte définitivement (miroir de
 * mongoAuth.js::deleteMongoSession).
 * @param {string} sessionId
 */
async function deleteSessionFiles(sessionId) {
  const dir = getSessionDir(sessionId);
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
    console.log(`[FileAuthState] Dossier supprimé : ${sessionId}`);
  } catch (err) {
    console.error(`[FileAuthState] deleteSessionFiles error (${sessionId}):`, err.message);
  }
}

/**
 * Liste les sessionIds qui ont un dossier de credentials local valide
 * (contient au moins creds.json). Utilisé pour vérifier, au redémarrage,
 * que le dossier attendu par l'index Mongo existe bien avant de tenter une
 * reconnexion (voir Phase 2 — sessionManager.js).
 * @returns {string[]}
 */
function listLocalSessionIds() {
  if (!fs.existsSync(SESSIONS_ROOT)) return [];
  return fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((sessionId) => sessionDirExists(sessionId));
}

module.exports = {
  SESSIONS_ROOT,
  getSessionDir,
  sessionDirExists,
  useFileAuthState,
  deleteSessionFiles,
  listLocalSessionIds,
};
