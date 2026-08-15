'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const cryptoTransport = require('../utils/hotReleaseCrypto');

class FakeCryptoDb {
  constructor() { this.doc = null; }
  collection(name) {
    assert.equal(name, cryptoTransport.COLLECTION);
    return {
      findOne: async ({ _id }) => (_id === cryptoTransport.KEY_ID && this.doc ? { ...this.doc } : null),
      updateOne: async (_filter, update) => {
        if (!this.doc) this.doc = { _id: cryptoTransport.KEY_ID, ...(update.$setOnInsert || {}) };
        return { acknowledged: true, upsertedCount: this.doc ? 1 : 0 };
      },
    };
  }
}

test('la paire RSA HOT est générée une fois puis restaurée depuis Mongo', async () => {
  const db = new FakeCryptoDb();
  cryptoTransport._private.clearKeyCacheForTests();
  const first = await cryptoTransport.ensureKeyPair(db);
  assert.match(first.publicKeyPem, /BEGIN PUBLIC KEY/);
  assert.match(first.privateKeyPem, /BEGIN PRIVATE KEY/);
  assert.match(first.fingerprint, /^sha256:[a-f0-9]{64}$/);

  cryptoTransport._private.clearKeyCacheForTests();
  const second = await cryptoTransport.ensureKeyPair(db);
  assert.equal(second.fingerprint, first.fingerprint);
  assert.equal(second.publicKeyPem, first.publicKeyPem);
});

test('une release chiffrée RSA-OAEP + AES-GCM fait un round-trip exact', async () => {
  const db = new FakeCryptoDb();
  cryptoTransport._private.clearKeyCacheForTests();
  const key = await cryptoTransport.ensureKeyPair(db);
  const payload = {
    releaseId: 'release-001',
    commitSha: 'abc123',
    updates: [{ action: 'upsert', path: 'commands/general_tools/ping.js', sourceBase64: Buffer.from('module.exports={}').toString('base64') }],
  };

  const manifest = cryptoTransport.encryptPayloadForPublicKey(payload, key.publicKeyPem, {
    releaseId: payload.releaseId,
    privateCommitSha: payload.commitSha,
    targetFingerprint: key.fingerprint,
  });
  const clear = await cryptoTransport.decryptManifestPayload(manifest, db);
  assert.deepEqual(clear, payload);
});

test('modifier les métadonnées ou le ciphertext invalide l’authentification GCM', async () => {
  const db = new FakeCryptoDb();
  cryptoTransport._private.clearKeyCacheForTests();
  const key = await cryptoTransport.ensureKeyPair(db);
  const manifest = cryptoTransport.encryptPayloadForPublicKey({
    releaseId: 'release-002', commitSha: 'def456', updates: [{ action: 'delete', path: 'commands/general_tools/test.js' }],
  }, key.publicKeyPem, {
    releaseId: 'release-002', privateCommitSha: 'def456', targetFingerprint: key.fingerprint,
  });

  await assert.rejects(
    cryptoTransport.decryptManifestPayload({ ...manifest, releaseId: 'release-tampered' }, db),
    error => error.code === 'HOT_RELEASE_DECRYPT_FAILED'
  );

  const bytes = Buffer.from(manifest.payload.ciphertext, 'base64');
  bytes[0] ^= 1;
  await assert.rejects(
    cryptoTransport.decryptManifestPayload({
      ...manifest,
      payload: { ...manifest.payload, ciphertext: bytes.toString('base64') },
    }, db),
    error => error.code === 'HOT_RELEASE_DECRYPT_FAILED'
  );
});

test('une release visant une autre empreinte runtime est refusée avant activation', async () => {
  const db = new FakeCryptoDb();
  cryptoTransport._private.clearKeyCacheForTests();
  const key = await cryptoTransport.ensureKeyPair(db);
  const manifest = cryptoTransport.encryptPayloadForPublicKey({
    releaseId: 'release-003', commitSha: 'ghi789', updates: [{ action: 'delete', path: 'commands/general_tools/test.js' }],
  }, key.publicKeyPem, {
    releaseId: 'release-003', privateCommitSha: 'ghi789', targetFingerprint: key.fingerprint,
  });

  await assert.rejects(
    cryptoTransport.decryptManifestPayload({ ...manifest, targetFingerprint: 'sha256:' + '0'.repeat(64) }, db),
    error => error.code === 'HOT_RELEASE_WRONG_TARGET'
  );
});
