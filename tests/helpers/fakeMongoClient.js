/**
 * Double de test en mémoire pour utils/mongoClient.js — implémente
 * uniquement le sous-ensemble de l'API MongoDB réellement utilisé par
 * utils/sessionIndex.js (updateOne avec $setOnInsert/$set/$inc et upsert,
 * findOne, find().toArray(), deleteOne).
 *
 * But : tester le vrai comportement CRUD/idempotence de sessionIndex.js
 * sans dépendre d'une instance MongoDB réelle. N'est PAS un mock qui
 * vérifie des appels — c'est un stockage en mémoire qui se comporte
 * comme MongoDB pour ces opérations précises.
 */

'use strict';

function getAtPath(obj, dottedPath) {
  return dottedPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setAtPath(obj, dottedPath, value) {
  const keys = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

class FakeCollection {
  constructor() {
    this._docs = new Map(); // _id -> document
  }

  async findOne(filter) {
    const doc = this._docs.get(filter._id);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  find(filter = {}) {
    // Le vrai driver MongoDB renvoie un curseur de façon SYNCHRONE — seul
    // .toArray() est async. Reproduit ici pour ne pas fausser le test.
    const all = Array.from(this._docs.values()).map((d) => JSON.parse(JSON.stringify(d)));
    return { toArray: async () => all };
  }

  async updateOne(filter, update, opts = {}) {
    let doc = this._docs.get(filter._id);
    const existed = !!doc;

    if (!doc) {
      if (!opts.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      doc = {};
    }

    if (!existed && update.$setOnInsert) {
      for (const [k, v] of Object.entries(update.$setOnInsert)) setAtPath(doc, k, v);
    }
    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) setAtPath(doc, k, v);
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        const current = getAtPath(doc, k) || 0;
        setAtPath(doc, k, current + v);
      }
    }

    this._docs.set(filter._id, doc);
    return {
      matchedCount: existed ? 1 : 0,
      modifiedCount: existed ? 1 : 0,
      upsertedCount: existed ? 0 : 1,
    };
  }

  async deleteOne(filter) {
    const existed = this._docs.delete(filter._id);
    return { deletedCount: existed ? 1 : 0 };
  }
}

class FakeDb {
  constructor() {
    this._collections = new Map();
  }

  collection(name) {
    if (!this._collections.has(name)) this._collections.set(name, new FakeCollection());
    return this._collections.get(name);
  }

  listCollections() {
    // Le vrai driver MongoDB renvoie un curseur de façon SYNCHRONE.
    const names = Array.from(this._collections.keys()).map((name) => ({ name }));
    return { toArray: async () => names };
  }
}

/**
 * Installe un faux utils/mongoClient.js dans le cache Node AVANT que le
 * module testé (ex: sessionIndex.js) ne le require. Retourne la FakeDb
 * sous-jacente pour inspection directe dans les tests, et une fonction
 * `restore()` pour retirer le double du cache après le test.
 */
function installFakeMongoClient() {
  const fakeDb = new FakeDb();
  const mongoClientPath = require.resolve('../../utils/mongoClient');
  const previous = require.cache[mongoClientPath];

  require.cache[mongoClientPath] = {
    id: mongoClientPath,
    filename: mongoClientPath,
    loaded: true,
    exports: {
      getDb: async () => fakeDb,
      closeDb: async () => {},
    },
  };

  return {
    fakeDb,
    restore() {
      if (previous) require.cache[mongoClientPath] = previous;
      else delete require.cache[mongoClientPath];
    },
  };
}

module.exports = { installFakeMongoClient, FakeDb, FakeCollection };
