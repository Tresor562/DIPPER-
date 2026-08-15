'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hot = require('../utils/hotCommandUpdater');
const cryptoTransport = require('../utils/hotReleaseCrypto');
const poller = require('../utils/hotReleasePoller');

function commandSource(label) {
  return `'use strict';\nmodule.exports={name:'sample',aliases:['s'],async execute(){return ${JSON.stringify(label)};}};\n`;
}

function load(file) {
  delete require.cache[require.resolve(file)];
  return require(file);
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

class FakeDb {
  constructor() {
    this.crypto = null;
    this.state = null;
    this.manifest = null;
    this.history = [];
  }

  collection(name) {
    if (name === cryptoTransport.COLLECTION) {
      return {
        findOne: async ({ _id }) => (_id === cryptoTransport.KEY_ID ? clone(this.crypto) : null),
        updateOne: async (_filter, update) => {
          if (!this.crypto) this.crypto = { _id: cryptoTransport.KEY_ID, ...(update.$setOnInsert || {}) };
          return { acknowledged: true };
        },
      };
    }

    if (name === poller.STATE_COLLECTION) {
      return {
        findOne: async ({ _id }) => (_id === poller.STATE_ID ? clone(this.state) : null),
        updateOne: async (_filter, update) => {
          this.state = { ...(this.state || { _id: poller.STATE_ID }), ...(update.$setOnInsert || {}), ...(update.$set || {}) };
          return { acknowledged: true };
        },
      };
    }

    if (name === hot.ACTIVE_COLLECTION) {
      return {
        findOne: async ({ _id }) => (_id === hot.ACTIVE_MANIFEST_ID ? clone(this.manifest) : null),
        updateOne: async (filter, update) => {
          if (this.manifest && filter?.revision != null && Number(filter.revision) !== Number(this.manifest.revision)) {
            return { matchedCount: 0, upsertedCount: 0 };
          }
          const existed = !!this.manifest;
          this.manifest = { ...(this.manifest || { _id: hot.ACTIVE_MANIFEST_ID }), ...(update.$setOnInsert || {}), ...(update.$set || {}) };
          return { matchedCount: existed ? 1 : 0, upsertedCount: existed ? 0 : 1 };
        },
      };
    }

    if (name === hot.HISTORY_COLLECTION) {
      return {
        insertMany: async docs => {
          this.history.push(...docs.map(clone));
          return { acknowledged: true };
        },
      };
    }

    throw new Error(`collection inconnue: ${name}`);
  }
}

function mockManifestFetch(manifest) {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify(manifest), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  return () => { global.fetch = original; };
}

test('manifest public chiffré -> déchiffrement -> validation -> Mongo -> Map, sans redémarrage', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dipper-hot-pull-'));
  const commandsRoot = path.join(root, 'commands');
  const file = path.join(commandsRoot, 'general_tools', 'sample.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, commandSource('old'));
  const old = load(file);
  const commandMap = new Map([['sample', old], ['s', old]]);
  const db = new FakeDb();
  cryptoTransport._private.clearKeyCacheForTests();

  try {
    const key = await cryptoTransport.ensureKeyPair(db);
    const releaseId = 'hot-e2e-001';
    const commitSha = '1'.repeat(40);
    const manifest = cryptoTransport.encryptPayloadForPublicKey({
      releaseId,
      commitSha,
      updates: [{
        action: 'upsert',
        path: 'commands/general_tools/sample.js',
        sourceBase64: Buffer.from(commandSource('new')).toString('base64'),
      }],
    }, key.publicKeyPem, {
      releaseId,
      privateCommitSha: commitSha,
      targetFingerprint: key.fingerprint,
    });
    const restoreFetch = mockManifestFetch(manifest);
    try {
      const first = await poller.pollOnce({ db, commandMap, commandsRoot });
      assert.equal(first.status, 'applied');
      assert.equal(await commandMap.get('sample').execute(), 'new');
      assert.equal(db.manifest.revision, 1);
      assert.equal(db.state.lastAppliedReleaseId, releaseId);
      assert.equal(db.state.lastAppliedCommitSha, commitSha);

      const second = await poller.pollOnce({ db, commandMap, commandsRoot });
      assert.equal(second.status, 'already-applied');
      assert.equal(db.manifest.revision, 1, 'une release déjà appliquée ne doit pas recréer une promotion');
    } finally {
      restoreFetch();
    }
  } finally {
    cryptoTransport._private.clearKeyCacheForTests();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('une release chiffrée falsifiée est rejetée et la commande active reste inchangée', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dipper-hot-pull-reject-'));
  const commandsRoot = path.join(root, 'commands');
  const file = path.join(commandsRoot, 'general_tools', 'sample.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, commandSource('old'));
  const old = load(file);
  const commandMap = new Map([['sample', old], ['s', old]]);
  const db = new FakeDb();
  cryptoTransport._private.clearKeyCacheForTests();

  try {
    const key = await cryptoTransport.ensureKeyPair(db);
    const manifest = cryptoTransport.encryptPayloadForPublicKey({
      releaseId: 'hot-e2e-bad',
      commitSha: '2'.repeat(40),
      updates: [{ action: 'upsert', path: 'commands/general_tools/sample.js', sourceBase64: Buffer.from(commandSource('evil')).toString('base64') }],
    }, key.publicKeyPem, {
      releaseId: 'hot-e2e-bad',
      privateCommitSha: '2'.repeat(40),
      targetFingerprint: key.fingerprint,
    });
    const tampered = { ...manifest, privateCommitSha: '3'.repeat(40) };
    const restoreFetch = mockManifestFetch(tampered);
    try {
      await assert.rejects(
        poller.pollOnce({ db, commandMap, commandsRoot }),
        error => error.code === 'HOT_RELEASE_DECRYPT_FAILED'
      );
      assert.equal(await commandMap.get('sample').execute(), 'old');
      assert.equal(db.manifest, null);
      assert.equal(db.state.lastRejectedReleaseId, 'hot-e2e-bad');
    } finally {
      restoreFetch();
    }
  } finally {
    cryptoTransport._private.clearKeyCacheForTests();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
