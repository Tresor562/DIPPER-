/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║          𝐃𝐚𝐫𝐤 — Système PREMIUM Database              ║
 * ║  Sauvegarde JSON locale des utilisateurs premium        ║
 * ║  Fichier : utils/premiumDB.js                           ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *  - Gérer la liste des utilisateurs premium (ajout / suppression / vérification)
 *  - Sauvegarder en JSON dans data/premium.json
 *  - Vérification d'expiration automatique (optionnelle)
 *
 * UTILISATION dans une commande :
 *   const { isPremium, addPremium, removePremium, listPremium } = require('../../utils/premiumDB');
 */

const fs   = require('fs');
const path = require('path');

// ── Chemin du fichier de sauvegarde ────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, '..', 'data');
const DB_PATH   = path.join(DATA_DIR, 'premium.json');

// ── Création du dossier data/ si absent ────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Charge la DB depuis le disque ──────────────────────────────────────────
function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

// ── Sauvegarde la DB sur le disque ─────────────────────────────────────────
function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[premiumDB] Erreur sauvegarde:', err.message);
  }
}

// ── Normalise un JID en numéro brut (sans @s.whatsapp.net ni :X) ──────────
function normalizeJid(jid) {
  return jid.replace(/:[0-9]+/, '').split('@')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// FONCTIONS PUBLIQUES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie si un utilisateur est premium (et non expiré)
 * @param {string} jid - JID WhatsApp de l'utilisateur
 * @returns {boolean}
 */
function isPremium(jid) {
  const db   = loadDB();
  const num  = normalizeJid(jid);
  const user = db[num];
  if (!user) return false;

  // Si une expiration est définie, on la vérifie
  if (user.expiresAt && Date.now() > user.expiresAt) {
    // Premium expiré → on supprime automatiquement
    delete db[num];
    saveDB(db);
    return false;
  }

  return true;
}

/**
 * Ajoute un utilisateur premium
 * @param {string} jid        - JID WhatsApp de l'utilisateur
 * @param {number} [days]     - Durée en jours (0 = illimité)
 * @param {string} [addedBy]  - JID de l'admin qui ajoute
 * @returns {{ success: boolean, user: object }}
 */
function addPremium(jid, days = 0, addedBy = 'unknown') {
  const db        = loadDB();
  const num       = normalizeJid(jid);
  const now       = Date.now();
  const expiresAt = days > 0 ? now + days * 86400000 : null; // null = illimité

  db[num] = {
    jid       : `${num}@s.whatsapp.net`,
    addedAt   : now,
    addedBy   : normalizeJid(addedBy),
    expiresAt,                            // null = pas d'expiration
    days      : days || 'illimité',
  };

  saveDB(db);
  return { success: true, user: db[num] };
}

/**
 * Supprime un utilisateur premium
 * @param {string} jid
 * @returns {boolean} - true si l'utilisateur existait
 */
function removePremium(jid) {
  const db  = loadDB();
  const num = normalizeJid(jid);
  if (!db[num]) return false;
  delete db[num];
  saveDB(db);
  return true;
}

/**
 * Retourne la liste complète des premium (nettoyage des expirés inclus)
 * @returns {Array<object>}
 */
function listPremium() {
  const db      = loadDB();
  const now     = Date.now();
  let changed   = false;

  // Nettoyage automatique des entrées expirées
  for (const num of Object.keys(db)) {
    if (db[num].expiresAt && now > db[num].expiresAt) {
      delete db[num];
      changed = true;
    }
  }

  if (changed) saveDB(db);

  return Object.values(db);
}

/**
 * Retourne les infos premium d'un utilisateur (ou null si pas premium)
 * @param {string} jid
 * @returns {object|null}
 */
function getPremiumInfo(jid) {
  const db   = loadDB();
  const num  = normalizeJid(jid);
  const user = db[num];
  if (!user) return null;

  // Vérification expiration
  if (user.expiresAt && Date.now() > user.expiresAt) {
    delete db[num];
    saveDB(db);
    return null;
  }

  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = { isPremium, addPremium, removePremium, listPremium, getPremiumInfo };
