/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   𝐃𝐚𝐫𝐤 — Connexion MongoDB Singleton                      ║
 * ║   utils/mongoClient.js                                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Singleton MongoDB — une seule connexion partagée par tout le bot.
 * Compatible Railway, VPS, MongoDB Atlas.
 *
 * USAGE :
 *   const { getDb } = require('./utils/mongoClient');
 *   const db = await getDb();
 */

'use strict';

const { MongoClient } = require('mongodb');

let _client = null;
let _db     = null;
let _connecting = false;

/**
 * Retourne l'instance Db MongoDB (connexion créée si nécessaire).
 * @returns {Promise<import('mongodb').Db>}
 */
async function getDb() {
  if (_db) return _db;
  if (_connecting) {
    // Attendre que la connexion en cours se termine
    await new Promise(r => setTimeout(r, 200));
    return getDb();
  }

  const uri    = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'dark_bot';

  if (!uri) {
    throw new Error(
      '[MongoClient] ❌ MONGODB_URI manquante dans .env\n' +
      '  Exemple : MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/'
    );
  }

  _connecting = true;
  console.log('[MongoClient] 🔌 Connexion MongoDB en cours...');

  try {
    _client = new MongoClient(uri, {
      serverSelectionTimeoutMS : 10000,
      connectTimeoutMS         : 10000,
      socketTimeoutMS          : 45000,
      maxPoolSize              : 10,
      minPoolSize              : 2,
      retryWrites              : true,
      retryReads               : true,
    });

    await _client.connect();
    _db = _client.db(dbName);

    // Vérification connexion
    await _db.command({ ping: 1 });
    console.log(`[MongoClient] ✅ Connecté à MongoDB — database: "${dbName}"`);

    // Gérer la déconnexion proprement
    _client.on('close', () => {
      console.warn('[MongoClient] ⚠️ Connexion MongoDB fermée');
      _db = null;
    });

    _client.on('error', (err) => {
      console.error('[MongoClient] ❌ Erreur MongoDB:', err.message);
    });

    _connecting = false;
    return _db;

  } catch (err) {
    _connecting = false;
    _client     = null;
    _db         = null;
    console.error('[MongoClient] ❌ Échec connexion MongoDB:', err.message);
    throw err;
  }
}

/**
 * Ferme proprement la connexion MongoDB.
 * Appelé sur SIGTERM/SIGINT.
 */
async function closeDb() {
  try {
    if (_client) {
      await _client.close();
      _client = null;
      _db     = null;
      console.log('[MongoClient] 🛑 Connexion MongoDB fermée proprement');
    }
  } catch (err) {
    console.error('[MongoClient] closeDb error:', err.message);
  }
}

// Fermeture propre à l'arrêt du process
process.on('SIGTERM', closeDb);
process.on('SIGINT',  closeDb);

module.exports = { getDb, closeDb };
