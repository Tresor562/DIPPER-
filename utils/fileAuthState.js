/**
 * 𝐃𝐈𝐏𝐏𝐄𝐑 — Auth State fichiers + sauvegarde MongoDB durable.
 *
 * Baileys travaille avec son format multi-fichiers natif, tandis que chaque
 * fichier d'auth est répliqué dans MongoDB. Sur un nouveau disque Render,
 * le dossier local est reconstruit avant de recréer le socket WhatsApp.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { useMultiFileAuthState, BufferJSON, proto, initAuthCreds } = require('@whiskeysockets/baileys');
const { getDb } = require('./mongoClient');

const SESSIONS_ROOT = path.join(process.cwd(), 'sessions');
const BACKUP_COLLECTION = 'wa_session_auth_files_v1';
const backupTails = new Map();
const LEGACY_KEY_TYPES = [
  'app-state-sync-key', 'app-state-sync-version', 'sender-key-memory',
  'sender-key', 'pre-key', 'session'
].sort((a, b) => b.length - a.length);

function getSessionDir(sessionId) {
  return path.join(SESSIONS_ROOT, sessionId);
}

function sessionDirExists(sessionId) {
  const dir = getSessionDir(sessionId);
  return fs.existsSync(dir) && fs.existsSync(path.join(dir, 'creds.json'));
}

function walkFiles(root, dir = root, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(root, abs, out);
    else if (entry.isFile()) out.push({ abs, rel: path.relative(root, abs).split(path.sep).join('/') });
  }
  return out;
}

async function getBackupCollection() {
  const db = await getDb();
  const col = db.collection(BACKUP_COLLECTION);
  try { await col.createIndex({ sessionId: 1, path: 1 }, { unique: true }); } catch (_) {}
  try { await col.createIndex({ updatedAt: 1 }); } catch (_) {}
  return col;
}

async function backupSessionFilesNow(sessionId) {
  const dir = getSessionDir(sessionId);
  if (!sessionDirExists(sessionId)) return false;
  const files = walkFiles(dir);
  if (!files.length) return false;
  const col = await getBackupCollection();
  const now = new Date();
  const paths = [];
  const ops = [];
  for (const file of files) {
    const data = await fs.promises.readFile(file.abs);
    paths.push(file.rel);
    ops.push({
      updateOne: {
        filter: { sessionId, path: file.rel },
        update: { $set: { sessionId, path: file.rel, data: data.toString('base64'), size: data.length, updatedAt: now } },
        upsert: true,
      },
    });
  }
  if (ops.length) await col.bulkWrite(ops, { ordered: false });
  await col.deleteMany({ sessionId, path: { $nin: paths.concat('__manifest__') } });
  await col.updateOne(
    { sessionId, path: '__manifest__' },
    { $set: { sessionId, path: '__manifest__', fileCount: files.length, updatedAt: now } },
    { upsert: true }
  );
  return true;
}

function backupSessionFiles(sessionId) {
  const previous = backupTails.get(sessionId) || Promise.resolve();
  const run = previous.then(() => backupSessionFilesNow(sessionId), () => backupSessionFilesNow(sessionId));
  const tail = run.catch(err => {
    console.error(`[FileAuthState] sauvegarde Mongo échouée (${sessionId}):`, err.message);
    return false;
  });
  backupTails.set(sessionId, tail);
  tail.finally(() => { if (backupTails.get(sessionId) === tail) backupTails.delete(sessionId); }).catch(() => {});
  return run;
}

async function hasRemoteSessionBackup(sessionId) {
  try {
    const col = await getBackupCollection();
    return !!(await col.findOne({ sessionId, path: 'creds.json' }, { projection: { _id: 1 } }));
  } catch (err) {
    console.error(`[FileAuthState] vérification backup Mongo échouée (${sessionId}):`, err.message);
    return false;
  }
}

function parseLegacyKeyDocId(docId) {
  const value = String(docId || '');
  for (const type of LEGACY_KEY_TYPES) {
    if (value.startsWith(`${type}-`)) return { type, id: value.slice(type.length + 1) };
  }
  return null;
}

async function restoreLegacyMongoAuth(sessionId) {
  let db;
  try { db = await getDb(); } catch (_) { return false; }
  const collection = db.collection(`auth_${sessionId}`);
  let docs;
  try { docs = await collection.find({}).toArray(); } catch (_) { return false; }
  const credsDoc = docs.find(doc => doc._id === 'creds' && doc.value);
  if (!credsDoc) return false;

  const dir = getSessionDir(sessionId);
  await fs.promises.mkdir(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const creds = JSON.parse(credsDoc.value, BufferJSON.reviver) || initAuthCreds();
  Object.keys(state.creds).forEach(key => delete state.creds[key]);
  Object.assign(state.creds, creds);
  await saveCreds();

  const grouped = {};
  for (const doc of docs) {
    if (doc._id === 'creds' || !doc.value) continue;
    const parsed = parseLegacyKeyDocId(doc._id);
    if (!parsed) continue;
    let value = JSON.parse(doc.value, BufferJSON.reviver);
    if (parsed.type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
    grouped[parsed.type] = grouped[parsed.type] || {};
    grouped[parsed.type][parsed.id] = value;
  }
  if (Object.keys(grouped).length) await state.keys.set(grouped);
  const ok = sessionDirExists(sessionId);
  if (ok) {
    console.log(`[FileAuthState] ♻️ ${sessionId} récupérée depuis l'ancien stockage Mongo auth_*`);
    await backupSessionFiles(sessionId).catch(() => false);
  }
  return ok;
}

async function restoreSessionFiles(sessionId, { force = false } = {}) {
  if (!force && sessionDirExists(sessionId)) return true;
  let docs = [];
  try {
    const col = await getBackupCollection();
    docs = await col.find({ sessionId, path: { $ne: '__manifest__' } }).toArray();
  } catch (err) {
    console.error(`[FileAuthState] restauration Mongo inaccessible (${sessionId}):`, err.message);
  }

  if (docs.length) {
    const dir = getSessionDir(sessionId);
    await fs.promises.mkdir(dir, { recursive: true });
    for (const doc of docs) {
      const rel = String(doc.path || '');
      if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue;
      const abs = path.join(dir, ...rel.split('/'));
      if (!abs.startsWith(dir + path.sep) && abs !== dir) continue;
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, Buffer.from(String(doc.data || ''), 'base64'));
    }
    if (sessionDirExists(sessionId)) {
      console.log(`[FileAuthState] ♻️ Session ${sessionId} restaurée depuis MongoDB (${docs.length} fichier(s))`);
      return true;
    }
  }

  // Compatibilité : tente l'ancien stockage auth_<sessionId>. Les anciennes
  // collections n'étaient volontairement jamais supprimées lors de la migration.
  return restoreLegacyMongoAuth(sessionId);
}

async function useFileAuthState(sessionId) {
  if (!sessionDirExists(sessionId)) await restoreSessionFiles(sessionId);
  const dir = getSessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const { state, saveCreds: nativeSaveCreds } = await useMultiFileAuthState(dir);

  if (state?.keys?.set && !state.keys.__dipperPersistentWrapped) {
    const nativeSet = state.keys.set.bind(state.keys);
    state.keys.set = async (data) => {
      const result = await nativeSet(data);
      await backupSessionFiles(sessionId).catch(() => false);
      return result;
    };
    Object.defineProperty(state.keys, '__dipperPersistentWrapped', { value: true, enumerable: false });
  }

  const saveCreds = async () => {
    await nativeSaveCreds();
    await backupSessionFiles(sessionId).catch(() => false);
  };

  if (sessionDirExists(sessionId)) await backupSessionFiles(sessionId).catch(() => false);
  return { state, saveCreds };
}

async function deleteSessionFiles(sessionId) {
  const dir = getSessionDir(sessionId);
  try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch (err) {
    console.error(`[FileAuthState] suppression locale échouée (${sessionId}):`, err.message);
  }
  try {
    const col = await getBackupCollection();
    await col.deleteMany({ sessionId });
    console.log(`[FileAuthState] Session supprimée localement + MongoDB : ${sessionId}`);
  } catch (err) {
    console.error(`[FileAuthState] suppression backup Mongo échouée (${sessionId}):`, err.message);
  }
}

function listLocalSessionIds() {
  if (!fs.existsSync(SESSIONS_ROOT)) return [];
  return fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(sessionId => sessionDirExists(sessionId));
}

module.exports = {
  SESSIONS_ROOT,
  BACKUP_COLLECTION,
  getSessionDir,
  sessionDirExists,
  useFileAuthState,
  deleteSessionFiles,
  listLocalSessionIds,
  backupSessionFiles,
  restoreSessionFiles,
  restoreLegacyMongoAuth,
  hasRemoteSessionBackup,
};
