'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const publisher = require('./publish-hot-commands');
const cryptoTransport = require('../utils/hotReleaseCrypto');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function readPublicKeyInfo() {
  if (process.env.HOT_PUBLIC_KEY_INFO_FILE) {
    return JSON.parse(fs.readFileSync(process.env.HOT_PUBLIC_KEY_INFO_FILE, 'utf8'));
  }
  if (process.env.HOT_PUBLIC_KEY_INFO_JSON) {
    return JSON.parse(process.env.HOT_PUBLIC_KEY_INFO_JSON);
  }
  throw new Error('HOT_PUBLIC_KEY_INFO_FILE ou HOT_PUBLIC_KEY_INFO_JSON requis.');
}

function main() {
  const before = process.env.BEFORE_SHA || '';
  const after = process.env.AFTER_SHA || git(['rev-parse', 'HEAD']);
  const changes = publisher.parseDiff(before, after);
  const classified = publisher.classifyChanges(changes);
  if (classified.runtimeNonHot.length) {
    throw new Error(`Commit CORE détecté, release HOT refusée: ${classified.runtimeNonHot.join(', ')}`);
  }
  if (!classified.updates.length) throw new Error('Aucun changement commands/**/*.js dans ce commit.');

  const keyInfo = readPublicKeyInfo();
  if (!keyInfo?.publicKeyPem || !keyInfo?.fingerprint) {
    throw new Error('Information de clé HOT incomplète.');
  }

  const releaseId = process.env.HOT_RELEASE_ID || `hot-${after.slice(0, 12)}-${Date.now()}`;
  const payload = publisher.buildPayload(classified.updates, after);
  payload.releaseId = releaseId;

  const manifest = cryptoTransport.encryptPayloadForPublicKey(payload, keyInfo.publicKeyPem, {
    releaseId,
    privateCommitSha: after,
    targetFingerprint: keyInfo.fingerprint,
  });

  const output = path.resolve(process.env.HOT_RELEASE_OUTPUT || path.join(process.cwd(), 'hot-release-manifest.json'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`[hot-release-builder] ✅ ${classified.updates.length} changement(s) chiffré(s) → ${output}`);
  console.log(`[hot-release-builder] release=${releaseId} target=${keyInfo.fingerprint}`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('[hot-release-builder] ❌', error?.stack || error?.message || String(error));
    process.exit(1);
  }
}

module.exports = { readPublicKeyInfo };
