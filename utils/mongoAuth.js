/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐚𝐫𝐤 — MongoDB Auth State pour Baileys Multi-Sessions   ║
 * ║   utils/mongoAuth.js                                         ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RÔLE :
 *   Remplace useMultiFileAuthState (fichiers locaux) par un stockage
 *   MongoDB Atlas — chaque utilisateur a sa propre collection de creds.
 *
 * COMPATIBLE :
 *   - Railway (ephemeral filesystem → MongoDB obligatoire)
 *   - MongoDB Atlas (cloud)
 *   - VPS Linux + PM2
 *   - Baileys @whiskeysockets/baileys >= 6.5
 *
 * SÉCURITÉ :
 *   - Chaque session est isolée dans sa propre collection Mongo
 *   - Les sessions ne peuvent pas interférer entre elles
 *   - Reconnexion automatique depuis MongoDB au redémarrage
 *
 * USAGE :
 *   const { useMongoAuthState } = require('./utils/mongoAuth');
 *   const { state, saveCreds } = await useMongoAuthState(db, 'session_22912345678');
 */

'use strict';

const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

/**
 * Crée un auth state Baileys stocké dans MongoDB.
 * @param {import('mongodb').Db} db          — instance Db Mongo
 * @param {string}               sessionId   — ex: 'session_22912345678'
 * @returns {{ state, saveCreds }}
 */
async function useMongoAuthState(db, sessionId) {
  const collection = db.collection(`auth_${sessionId}`);

  // ── Helpers lecture/écriture ──────────────────────────────────────────────

  const readData = async (id) => {
    try {
      const doc = await collection.findOne({ _id: id });
      if (!doc?.value) return null;
      return JSON.parse(doc.value, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const writeData = async (id, value) => {
    try {
      const serialized = JSON.stringify(value, BufferJSON.replacer);
      await collection.updateOne(
        { _id: id },
        { $set: { value: serialized, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      console.error(`[MongoAuth] writeData error (${id}):`, err.message);
    }
  };

  const removeData = async (id) => {
    try {
      await collection.deleteOne({ _id: id });
    } catch {}
  };

  // ── Créer index TTL si possible (nettoyage auto des sessions expirées) ───
  try {
    await collection.createIndex(
      { updatedAt: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 90, sparse: true } // 90 jours
    );
  } catch {} // index peut déjà exister

  // ── Charger ou créer les creds ────────────────────────────────────────────
  const creds = (await readData('creds')) || initAuthCreds();

  // ── State Baileys complet ─────────────────────────────────────────────────
  const state = {
    creds,

    keys: {
      get: async (type, ids) => {
        const data = {};
        for (const id of ids) {
          let value = await readData(`${type}-${id}`);
          // Baileys exige que pre-keys soient des objets { type, id, ... }
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          data[id] = value;
        }
        return data;
      },

      set: async (data) => {
        const promises = [];
        for (const [category, entries] of Object.entries(data)) {
          for (const [id, value] of Object.entries(entries || {})) {
            const docId = `${category}-${id}`;
            if (value) {
              promises.push(writeData(docId, value));
            } else {
              promises.push(removeData(docId));
            }
          }
        }
        await Promise.allSettled(promises);
      },
    },
  };

  // ── saveCreds : sauvegarde uniquement les creds (pas les keys) ───────────
  const saveCreds = async () => {
    try {
      await writeData('creds', state.creds);
    } catch (err) {
      console.error('[MongoAuth] saveCreds error:', err.message);
    }
  };

  return { state, saveCreds };
}

/**
 * Supprime complètement une session MongoDB.
 * Appelé quand un utilisateur se déconnecte définitivement.
 * @param {import('mongodb').Db} db
 * @param {string} sessionId
 */
async function deleteMongoSession(db, sessionId) {
  try {
    await db.collection(`auth_${sessionId}`).drop();
    console.log(`[MongoAuth] Session supprimée : ${sessionId}`);
  } catch (err) {
    if (!err.message?.includes('ns not found')) {
      console.error(`[MongoAuth] deleteSession error:`, err.message);
    }
  }
}

/**
 * Liste toutes les sessions existantes dans MongoDB.
 * @param {import('mongodb').Db} db
 * @returns {Promise<string[]>} — liste de sessionIds
 */
async function listMongoSessions(db) {
  try {
    const collections = await db.listCollections().toArray();
    return collections
      .map(c => c.name)
      .filter(n => n.startsWith('auth_'))
      .map(n => n.replace('auth_', ''));
  } catch {
    return [];
  }
}

module.exports = { useMongoAuthState, deleteMongoSession, listMongoSessions };
