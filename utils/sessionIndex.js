/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐈𝐏𝐏𝐄𝐑 — Index Mongo des Sessions (métadonnées)          ║
 * ║   utils/sessionIndex.js                                      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *   [Chantier "Architecture hybride"] MongoDB ne stocke plus les
 *   credentials WhatsApp (voir utils/fileAuthState.js) — il devient un
 *   simple index des sessions : une collection `sessions_index`, un
 *   document par session, contenant uniquement les métadonnées :
 *
 *     sessionId, phoneNumber, owner, origin, createdAt, lastActivity,
 *     state (isOnline, isRegistered), stats (reconnectCount, ...)
 *
 *   Ce module ne connaît RIEN de Baileys, ni de la logique de pairing —
 *   uniquement du CRUD sur ces métadonnées, réutilisant la connexion
 *   singleton existante (utils/mongoClient.js).
 *
 * COMPATIBILITÉ ASCENDANTE :
 *   `origin` et `owner` sont optionnels partout dans ce module — les
 *   canaux externes (bot Telegram, site Web) ne sont pas modifiés par ce
 *   chantier et ne les envoient pas forcément. Une valeur par défaut
 *   ('unknown') est utilisée en leur absence plutôt que de rendre le champ
 *   obligatoire, pour ne jamais faire échouer une création de session à
 *   cause d'une métadonnée manquante.
 */

'use strict';

const { getDb } = require('./mongoClient');

const COLLECTION = 'sessions_index';
const META_COLLECTION = 'sessions_meta'; // petits drapeaux internes (ex: migration one-shot déjà exécutée)

async function getCollection() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

async function getMetaCollection() {
  const db = await getDb();
  return db.collection(META_COLLECTION);
}

/**
 * Crée l'entrée d'index d'une session si elle n'existe pas encore
 * (idempotent — appel sûr à chaque démarrage/reconnexion d'une session
 * déjà connue : ne réécrase jamais createdAt/owner/origin déjà enregistrés).
 * @param {string} sessionId
 * @param {{ phoneNumber?: string, owner?: string, origin?: string }} [meta]
 * @returns {Promise<object>} le document (nouveau ou existant)
 */
async function ensureSession(sessionId, meta = {}) {
  const col = await getCollection();
  const now = new Date();
  await col.updateOne(
    { _id: sessionId },
    {
      $setOnInsert: {
        _id: sessionId,
        sessionId,
        phoneNumber: meta.phoneNumber || null,
        owner: meta.owner || 'unknown',
        origin: meta.origin || 'unknown',
        createdAt: now,
        state: { isOnline: false, isRegistered: false },
        stats: { reconnectCount: 0, pairingCount: 0 },
      },
      $set: { lastActivity: now },
    },
    { upsert: true }
  );
  return col.findOne({ _id: sessionId });
}

/**
 * Met à jour l'état (isOnline / isRegistered) d'une session et rafraîchit
 * `lastActivity`.
 * @param {string} sessionId
 * @param {{ isOnline?: boolean, isRegistered?: boolean }} state
 */
async function setState(sessionId, state = {}) {
  const col = await getCollection();
  const update = { lastActivity: new Date() };
  if (typeof state.isOnline === 'boolean') update['state.isOnline'] = state.isOnline;
  if (typeof state.isRegistered === 'boolean') update['state.isRegistered'] = state.isRegistered;
  await col.updateOne({ _id: sessionId }, { $set: update });
}

/**
 * Rafraîchit uniquement `lastActivity` (activité générique — message reçu,
 * reconnexion, etc. — sans changer l'état).
 * @param {string} sessionId
 */
async function touchActivity(sessionId) {
  const col = await getCollection();
  await col.updateOne({ _id: sessionId }, { $set: { lastActivity: new Date() } });
}

/**
 * Incrémente un compteur de statistiques (ex: 'reconnectCount',
 * 'pairingCount').
 * @param {string} sessionId
 * @param {string} statName
 * @param {number} [amount]
 */
async function incrementStat(sessionId, statName, amount = 1) {
  const col = await getCollection();
  await col.updateOne({ _id: sessionId }, { $inc: { [`stats.${statName}`]: amount } });
}

/**
 * Retourne l'entrée d'index d'une session (ou null).
 * @param {string} sessionId
 */
async function getSessionMeta(sessionId) {
  const col = await getCollection();
  return col.findOne({ _id: sessionId });
}

/**
 * Retourne toutes les sessions indexées — utilisé au redémarrage pour
 * savoir quelles sessions recharger (voir Phase 2, sessionManager.js).
 * @returns {Promise<object[]>}
 */
async function listSessions() {
  const col = await getCollection();
  return col.find({}).toArray();
}

/**
 * Supprime l'entrée d'index d'une session (les fichiers locaux de
 * credentials sont supprimés séparément, voir fileAuthState.js).
 * @param {string} sessionId
 */
async function deleteSessionMeta(sessionId) {
  const col = await getCollection();
  await col.deleteOne({ _id: sessionId });
}

/**
 * Vérifie si un drapeau de migration one-shot a déjà été exécuté (voir
 * Phase 3 — scripts/migrate-sessions-to-hybrid.js). Empêche toute
 * ré-exécution accidentelle d'une migration déjà faite.
 * @param {string} name ex: 'hybrid-storage-v1'
 * @returns {Promise<boolean>}
 */
async function isMigrationDone(name) {
  const col = await getMetaCollection();
  const doc = await col.findOne({ _id: `migration:${name}` });
  return !!doc?.done;
}

/**
 * Marque un drapeau de migration one-shot comme terminé.
 * @param {string} name
 * @param {object} [details] informations libres à conserver (ex: nombre de
 *   sessions migrées) pour audit ultérieur.
 */
async function markMigrationDone(name, details = {}) {
  const col = await getMetaCollection();
  await col.updateOne(
    { _id: `migration:${name}` },
    { $set: { done: true, completedAt: new Date(), ...details } },
    { upsert: true }
  );
}

module.exports = {
  ensureSession,
  setState,
  touchActivity,
  incrementStat,
  getSessionMeta,
  listSessions,
  deleteSessionMeta,
  isMigrationDone,
  markMigrationDone,
};
