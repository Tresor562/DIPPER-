'use strict';

const { enqueueBatch } = require('./hotCommandUpdater');
const { ensureKeyPair, decryptManifestPayload } = require('./hotReleaseCrypto');

const MANIFEST_URL = 'https://raw.githubusercontent.com/Tresor562/THE_BIG_DIPPER/main/hot-releases/manifest.json';
const STATE_COLLECTION = 'hot_release_state';
const STATE_ID = 'public-wrapper-v1';
const DEFAULT_POLL_MS = 45_000;
const MIN_POLL_MS = 15_000;
const MAX_POLL_MS = 5 * 60_000;
const MAX_MANIFEST_BYTES = 3 * 1024 * 1024;

let pollTimer = null;
let pollRunning = false;
let started = false;

function pollIntervalMs() {
  const requested = Number(process.env.HOT_RELEASE_POLL_MS || DEFAULT_POLL_MS);
  if (!Number.isFinite(requested)) return DEFAULT_POLL_MS;
  return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, Math.floor(requested)));
}

function stateCollection(db) {
  return db.collection(STATE_COLLECTION);
}

async function readState(db) {
  return (await stateCollection(db).findOne({ _id: STATE_ID })) || { _id: STATE_ID };
}

async function writeState(db, values) {
  await stateCollection(db).updateOne(
    { _id: STATE_ID },
    { $set: { ...values, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
}

async function fetchManifest() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const url = `${MANIFEST_URL}?hot=${Date.now()}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'cache-control': 'no-cache',
        'user-agent': 'THE-BIG-DIPPER-HotUpdater/1.0',
      },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = new Error(`Manifest GitHub HTTP ${response.status}`);
      error.code = 'HOT_RELEASE_FETCH_FAILED';
      throw error;
    }

    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_MANIFEST_BYTES) {
      const error = new Error(`Manifest HOT trop volumineux (${length} octets).`);
      error.code = 'HOT_RELEASE_TOO_LARGE';
      throw error;
    }

    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_MANIFEST_BYTES) {
      const error = new Error('Manifest HOT trop volumineux.');
      error.code = 'HOT_RELEASE_TOO_LARGE';
      throw error;
    }
    try {
      return JSON.parse(text);
    } catch (_) {
      const error = new Error('Manifest HOT public invalide.');
      error.code = 'HOT_RELEASE_INVALID';
      throw error;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('Timeout lors de la lecture du manifest HOT GitHub.');
      timeout.code = 'HOT_RELEASE_FETCH_FAILED';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isPermanentReleaseError(error) {
  const code = String(error?.code || '');
  return /HOT_RELEASE_(INVALID|WRONG_TARGET|DECRYPT_FAILED|TOO_LARGE)/.test(code)
    || /HOT_(PATH|SOURCE|BATCH|ACTION|DUPLICATE|COLLISION|EMPTY|SYNTAX|MODULE|RUNTIME_LOAD)/.test(code);
}

async function pollOnce({ db, commandMap } = {}) {
  if (!db) throw new Error('MongoDB requis pour le poller HOT.');
  const manifest = await fetchManifest();
  if (!manifest || manifest.active === false) return { status: 'idle' };

  const releaseId = String(manifest.releaseId || '');
  if (!releaseId) {
    const error = new Error('releaseId absent du manifest HOT.');
    error.code = 'HOT_RELEASE_INVALID';
    throw error;
  }

  const state = await readState(db);
  if (state.lastAppliedReleaseId === releaseId) return { status: 'already-applied', releaseId };
  if (state.lastRejectedReleaseId === releaseId && state.retryAfter && new Date(state.retryAfter).getTime() > Date.now()) {
    return { status: 'rejected-cooldown', releaseId };
  }

  try {
    const payload = await decryptManifestPayload(manifest, db);
    if (!payload) return { status: 'idle' };

    const result = await enqueueBatch(payload.updates, {
      db,
      commandMap,
      commitSha: payload.commitSha,
      actor: 'encrypted-public-wrapper',
    });

    await writeState(db, {
      lastAppliedReleaseId: releaseId,
      lastAppliedCommitSha: payload.commitSha,
      lastAppliedAt: new Date(),
      lastRejectedReleaseId: null,
      lastError: null,
      retryAfter: null,
      manifestUrl: MANIFEST_URL,
    });
    console.log(`[hot-release] ✅ ${releaseId} appliquée sans redémarrage Render`);
    return { status: 'applied', releaseId, result };
  } catch (error) {
    const permanent = isPermanentReleaseError(error);
    const retryAfter = new Date(Date.now() + (permanent ? 24 * 60 * 60_000 : 5 * 60_000));
    await writeState(db, {
      lastRejectedReleaseId: releaseId,
      lastError: `${error.code || 'ERROR'}: ${error.message || error}`.slice(0, 1000),
      lastErrorAt: new Date(),
      retryAfter,
      manifestUrl: MANIFEST_URL,
    }).catch(() => {});
    console.error(`[hot-release] ❌ ${releaseId} rejetée — ${error.code || 'ERROR'}: ${error.message}`);
    throw error;
  }
}

async function startHotReleasePoller({ db, commandMap } = {}) {
  if (started) return { started: false, reason: 'already-started' };
  if (!db) return { started: false, reason: 'no-db' };
  started = true;

  try {
    const key = await ensureKeyPair(db);
    console.log(`[hot-release] 🔐 transport chiffré prêt — ${key.fingerprint.slice(0, 25)}…`);
  } catch (error) {
    started = false;
    console.error('[hot-release] clé de transport indisponible:', error.message);
    return { started: false, reason: 'key-failed', error: error.message };
  }

  const run = async () => {
    if (pollRunning) return;
    pollRunning = true;
    try { await pollOnce({ db, commandMap }); }
    catch (error) {
      if (String(error?.code || '') === 'HOT_RELEASE_FETCH_FAILED') {
        console.warn('[hot-release] GitHub temporairement indisponible:', error.message);
      }
    } finally {
      pollRunning = false;
    }
  };

  const first = setTimeout(run, 5_000);
  if (first.unref) first.unref();
  pollTimer = setInterval(run, pollIntervalMs());
  if (pollTimer.unref) pollTimer.unref();
  return { started: true, intervalMs: pollIntervalMs() };
}

function stopHotReleasePoller() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  pollRunning = false;
  started = false;
}

module.exports = {
  MANIFEST_URL,
  STATE_COLLECTION,
  STATE_ID,
  pollIntervalMs,
  fetchManifest,
  pollOnce,
  startHotReleasePoller,
  stopHotReleasePoller,
  _private: { readState, writeState, isPermanentReleaseError },
};
