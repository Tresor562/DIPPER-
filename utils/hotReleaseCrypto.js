'use strict';

const crypto = require('crypto');

const COLLECTION = 'hot_command_crypto';
const KEY_ID = 'runtime-rsa-v1';
const SCHEMA = 1;
const ALGORITHM = 'RSA-OAEP-SHA256+AES-256-GCM';
const MAX_CIPHERTEXT_BYTES = 2 * 1024 * 1024;

let cachedKeyPair = null;

function hotCryptoError(code, message) {
  return Object.assign(new Error(message), { code });
}

function fingerprintPublicKey(publicKeyPem) {
  const key = crypto.createPublicKey(publicKeyPem);
  const der = key.export({ type: 'spki', format: 'der' });
  return `sha256:${crypto.createHash('sha256').update(der).digest('hex')}`;
}

function generateKeyPair() {
  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    publicKeyPem: pair.publicKey,
    privateKeyPem: pair.privateKey,
    fingerprint: fingerprintPublicKey(pair.publicKey),
  };
}

async function ensureKeyPair(db) {
  if (cachedKeyPair) return cachedKeyPair;
  if (!db) throw hotCryptoError('HOT_CRYPTO_NO_DB', 'MongoDB requis pour la clé HOT.');

  const collection = db.collection(COLLECTION);
  let doc = await collection.findOne({ _id: KEY_ID });
  if (!doc?.privateKeyPem || !doc?.publicKeyPem) {
    const generated = generateKeyPair();
    await collection.updateOne(
      { _id: KEY_ID },
      {
        $setOnInsert: {
          publicKeyPem: generated.publicKeyPem,
          privateKeyPem: generated.privateKeyPem,
          fingerprint: generated.fingerprint,
          createdAt: new Date(),
          algorithm: ALGORITHM,
        },
      },
      { upsert: true }
    );
    doc = await collection.findOne({ _id: KEY_ID });
  }

  if (!doc?.privateKeyPem || !doc?.publicKeyPem) {
    throw hotCryptoError('HOT_CRYPTO_KEY_FAILED', 'Impossible de charger la clé HOT durable.');
  }

  const actualFingerprint = fingerprintPublicKey(doc.publicKeyPem);
  if (doc.fingerprint && doc.fingerprint !== actualFingerprint) {
    throw hotCryptoError('HOT_CRYPTO_KEY_INVALID', 'Empreinte de clé HOT incohérente.');
  }

  cachedKeyPair = {
    publicKeyPem: doc.publicKeyPem,
    privateKeyPem: doc.privateKeyPem,
    fingerprint: actualFingerprint,
  };
  return cachedKeyPair;
}

async function getPublicKeyInfo(db) {
  const key = await ensureKeyPair(db);
  return {
    schema: SCHEMA,
    algorithm: ALGORITHM,
    fingerprint: key.fingerprint,
    publicKeyPem: key.publicKeyPem,
  };
}

function aadForManifest(manifest) {
  return Buffer.from([
    String(manifest.schema || ''),
    String(manifest.releaseId || ''),
    String(manifest.privateCommitSha || ''),
    String(manifest.targetFingerprint || ''),
  ].join('|'), 'utf8');
}

function assertManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'Manifest HOT absent.');
  }
  if (manifest.active === false) return false;
  if (Number(manifest.schema) !== SCHEMA) {
    throw hotCryptoError('HOT_RELEASE_INVALID', `Schéma HOT non supporté: ${manifest.schema}`);
  }
  if (manifest.algorithm !== ALGORITHM) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'Algorithme HOT non supporté.');
  }
  if (!manifest.releaseId || !manifest.privateCommitSha || !manifest.targetFingerprint) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'Métadonnées HOT incomplètes.');
  }
  const payload = manifest.payload;
  if (!payload || !payload.encryptedKey || !payload.iv || !payload.tag || !payload.ciphertext) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'Payload HOT chiffré incomplet.');
  }
  return true;
}

async function decryptManifestPayload(manifest, db) {
  if (!assertManifestShape(manifest)) return null;
  const keyPair = await ensureKeyPair(db);
  if (manifest.targetFingerprint !== keyPair.fingerprint) {
    throw hotCryptoError('HOT_RELEASE_WRONG_TARGET', 'Cette release HOT vise une autre clé runtime.');
  }

  let encryptedKey;
  let iv;
  let tag;
  let ciphertext;
  try {
    encryptedKey = Buffer.from(manifest.payload.encryptedKey, 'base64');
    iv = Buffer.from(manifest.payload.iv, 'base64');
    tag = Buffer.from(manifest.payload.tag, 'base64');
    ciphertext = Buffer.from(manifest.payload.ciphertext, 'base64');
  } catch (_) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'Encodage base64 HOT invalide.');
  }

  if (ciphertext.length > MAX_CIPHERTEXT_BYTES) {
    throw hotCryptoError('HOT_RELEASE_TOO_LARGE', `Payload HOT trop volumineux (${ciphertext.length} octets).`);
  }
  if (iv.length !== 12 || tag.length !== 16) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'IV/tag HOT invalide.');
  }

  let aesKey;
  try {
    aesKey = crypto.privateDecrypt(
      {
        key: keyPair.privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      encryptedKey
    );
  } catch (_) {
    throw hotCryptoError('HOT_RELEASE_DECRYPT_FAILED', 'Clé de release HOT impossible à déchiffrer.');
  }

  if (aesKey.length !== 32) {
    throw hotCryptoError('HOT_RELEASE_DECRYPT_FAILED', 'Clé AES HOT invalide.');
  }

  let clear;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAAD(aadForManifest(manifest));
    decipher.setAuthTag(tag);
    clear = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (_) {
    throw hotCryptoError('HOT_RELEASE_DECRYPT_FAILED', 'Authentification du payload HOT échouée.');
  }

  let payload;
  try {
    payload = JSON.parse(clear.toString('utf8'));
  } catch (_) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'JSON HOT déchiffré invalide.');
  }

  if (payload.releaseId !== manifest.releaseId) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'releaseId HOT incohérent.');
  }
  if (payload.commitSha !== manifest.privateCommitSha) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'SHA privé HOT incohérent.');
  }
  if (!Array.isArray(payload.updates) || payload.updates.length === 0) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'Aucune commande dans la release HOT.');
  }
  return payload;
}

function encryptPayloadForPublicKey(payload, publicKeyPem, { releaseId, privateCommitSha, targetFingerprint } = {}) {
  const manifest = {
    schema: SCHEMA,
    active: true,
    algorithm: ALGORITHM,
    releaseId: String(releaseId || payload?.releaseId || ''),
    privateCommitSha: String(privateCommitSha || payload?.commitSha || ''),
    targetFingerprint: String(targetFingerprint || fingerprintPublicKey(publicKeyPem)),
  };
  if (!manifest.releaseId || !manifest.privateCommitSha) {
    throw hotCryptoError('HOT_RELEASE_INVALID', 'releaseId/privateCommitSha requis pour chiffrer.');
  }

  const body = {
    ...payload,
    releaseId: manifest.releaseId,
    commitSha: manifest.privateCommitSha,
  };
  const clear = Buffer.from(JSON.stringify(body), 'utf8');
  if (clear.length > MAX_CIPHERTEXT_BYTES) {
    throw hotCryptoError('HOT_RELEASE_TOO_LARGE', `Payload clair HOT trop volumineux (${clear.length} octets).`);
  }

  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  cipher.setAAD(aadForManifest(manifest));
  const ciphertext = Buffer.concat([cipher.update(clear), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    aesKey
  );

  return {
    ...manifest,
    createdAt: new Date().toISOString(),
    payloadSha256: crypto.createHash('sha256').update(ciphertext).digest('hex'),
    payload: {
      encryptedKey: encryptedKey.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    },
  };
}

function clearKeyCacheForTests() {
  cachedKeyPair = null;
}

module.exports = {
  COLLECTION,
  KEY_ID,
  SCHEMA,
  ALGORITHM,
  MAX_CIPHERTEXT_BYTES,
  fingerprintPublicKey,
  ensureKeyPair,
  getPublicKeyInfo,
  decryptManifestPayload,
  encryptPayloadForPublicKey,
  _private: { aadForManifest, assertManifestShape, generateKeyPair, clearKeyCacheForTests },
};
