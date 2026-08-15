'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { loadCommands } = require('./commandLoader');

const ACTIVE_COLLECTION = 'hot_command_active';
const HISTORY_COLLECTION = 'hot_command_history';
const MAX_BATCH = 25;
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 2 * 1024 * 1024;
const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_COMMANDS_ROOT = path.join(PROJECT_ROOT, 'commands');
const VALIDATOR = path.join(PROJECT_ROOT, 'scripts', 'validate-hot-command.js');

let applyQueue = Promise.resolve();

function hotUpdateToken() {
  return String(process.env.HOT_UPDATE_TOKEN || process.env.API_INTERNAL_TOKEN || '');
}

function isAuthorizedHotUpdate(provided) {
  const expected = hotUpdateToken();
  const actual = String(provided || '');
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCommandPath(input, commandsRoot = DEFAULT_COMMANDS_ROOT) {
  const raw = String(input || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!/^commands\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.js$/.test(raw)) {
    const error = new Error(`Chemin HOT interdit: ${raw || '(vide)'}`);
    error.code = 'HOT_PATH_FORBIDDEN';
    throw error;
  }
  const relativeInsideCommands = raw.slice('commands/'.length);
  const targetPath = path.resolve(commandsRoot, relativeInsideCommands);
  const root = path.resolve(commandsRoot) + path.sep;
  if (!targetPath.startsWith(root)) {
    const error = new Error(`Chemin HOT hors commands/: ${raw}`);
    error.code = 'HOT_PATH_FORBIDDEN';
    throw error;
  }
  return { relativePath: raw, targetPath };
}

function decodeSource(update) {
  if (typeof update.source === 'string') return update.source;
  if (typeof update.sourceBase64 === 'string') {
    return Buffer.from(update.sourceBase64, 'base64').toString('utf8');
  }
  const error = new Error(`Source absente pour ${update.path || 'commande'}`);
  error.code = 'HOT_SOURCE_MISSING';
  throw error;
}

function ensureSourceSafe(source, relativePath) {
  const bytes = Buffer.byteLength(source, 'utf8');
  if (!source.trim()) {
    const error = new Error(`Source vide: ${relativePath}`);
    error.code = 'HOT_SOURCE_INVALID';
    throw error;
  }
  if (bytes > MAX_SOURCE_BYTES) {
    const error = new Error(`Commande trop volumineuse: ${relativePath} (${bytes} octets)`);
    error.code = 'HOT_SOURCE_TOO_LARGE';
    throw error;
  }
  return bytes;
}

function atomicWrite(file, source) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.hot-write-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, source, 'utf8');
  fs.renameSync(tmp, file);
}

function snapshotFile(file) {
  if (!fs.existsSync(file)) return { exists: false, source: null };
  return { exists: true, source: fs.readFileSync(file, 'utf8') };
}

function restoreSnapshot(file, snapshot) {
  if (snapshot.exists) atomicWrite(file, snapshot.source);
  else {
    try { fs.rmSync(file, { force: true }); } catch (_) {}
  }
  try { delete require.cache[require.resolve(file)]; } catch (_) {}
}

function runValidator(file, relativePath) {
  const syntax = spawnSync(process.execPath, ['--check', file], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (syntax.status !== 0) {
    const error = new Error(`Syntaxe invalide ${relativePath}: ${(syntax.stderr || syntax.stdout || '').trim()}`);
    error.code = 'HOT_SYNTAX_INVALID';
    throw error;
  }

  const validation = spawnSync(process.execPath, [VALIDATOR, file], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, HOT_UPDATE_VALIDATION: '1' },
  });
  if (validation.status !== 0) {
    const error = new Error(`Module invalide ${relativePath}: ${(validation.stderr || validation.stdout || '').trim()}`);
    error.code = 'HOT_MODULE_INVALID';
    throw error;
  }

  try {
    return JSON.parse((validation.stdout || '').trim());
  } catch (_) {
    const error = new Error(`Validation illisible pour ${relativePath}.`);
    error.code = 'HOT_MODULE_INVALID';
    throw error;
  }
}

function metadataForExistingFile(file, relativePath) {
  if (!fs.existsSync(file)) return { ok: true, commands: [] };
  return runValidator(file, relativePath);
}

function metadataKeys(metadata) {
  const keys = new Set();
  for (const command of metadata?.commands || []) {
    const name = normalizeKey(command.name);
    if (name) keys.add(name);
    for (const alias of command.aliases || []) {
      const key = normalizeKey(alias);
      if (key) keys.add(key);
    }
  }
  return keys;
}

function prepareUpdates(updates, commandsRoot = DEFAULT_COMMANDS_ROOT) {
  if (!Array.isArray(updates) || updates.length === 0) {
    const error = new Error('Aucune mise à jour HOT fournie.');
    error.code = 'HOT_EMPTY_BATCH';
    throw error;
  }
  if (updates.length > MAX_BATCH) {
    const error = new Error(`Trop de fichiers dans un lot HOT (${updates.length}/${MAX_BATCH}).`);
    error.code = 'HOT_BATCH_TOO_LARGE';
    throw error;
  }

  const seen = new Set();
  const prepared = [];
  let totalBytes = 0;

  for (const update of updates) {
    const action = String(update?.action || 'upsert').toLowerCase();
    if (!['upsert', 'delete'].includes(action)) {
      const error = new Error(`Action HOT inconnue: ${action}`);
      error.code = 'HOT_ACTION_INVALID';
      throw error;
    }
    const normalized = normalizeCommandPath(update?.path, commandsRoot);
    if (seen.has(normalized.relativePath)) {
      const error = new Error(`Chemin HOT dupliqué dans le lot: ${normalized.relativePath}`);
      error.code = 'HOT_DUPLICATE_PATH';
      throw error;
    }
    seen.add(normalized.relativePath);

    let source = null;
    let hash = null;
    if (action === 'upsert') {
      source = decodeSource(update);
      totalBytes += ensureSourceSafe(source, normalized.relativePath);
      hash = sha256(source);
    }
    prepared.push({ ...normalized, action, source, hash });
  }

  if (totalBytes > MAX_TOTAL_SOURCE_BYTES) {
    const error = new Error(`Lot HOT trop volumineux (${totalBytes} octets).`);
    error.code = 'HOT_BATCH_TOO_LARGE';
    throw error;
  }
  return prepared;
}

function stageAndValidate(prepared) {
  const staged = [];
  try {
    for (const item of prepared) {
      item.oldMetadata = metadataForExistingFile(item.targetPath, item.relativePath);
      if (item.action !== 'upsert') {
        item.metadata = { ok: true, commands: [] };
        continue;
      }
      const candidatePath = `${item.targetPath}.hot-candidate-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.cjs`;
      fs.mkdirSync(path.dirname(candidatePath), { recursive: true });
      fs.writeFileSync(candidatePath, item.source, 'utf8');
      item.metadata = runValidator(candidatePath, item.relativePath);
      staged.push(candidatePath);
    }
    return staged;
  } catch (error) {
    for (const file of staged) {
      try { fs.rmSync(file, { force: true }); } catch (_) {}
    }
    throw error;
  }
}

function getStableCommandMap() {
  if (global.commands instanceof Map) return global.commands;
  return loadCommands();
}

function validateCollisions(prepared, stableMap) {
  const removedKeys = new Set();
  for (const item of prepared) {
    for (const key of metadataKeys(item.oldMetadata)) removedKeys.add(key);
  }

  const candidateOwners = new Map();
  for (const item of prepared) {
    for (const command of item.metadata?.commands || []) {
      const keys = [command.name, ...(command.aliases || [])].map(normalizeKey).filter(Boolean);
      for (const key of keys) {
        if (candidateOwners.has(key)) {
          const error = new Error(`Collision HOT dans le lot sur '${key}' entre ${candidateOwners.get(key)} et ${item.relativePath}.`);
          error.code = 'HOT_COMMAND_COLLISION';
          throw error;
        }
        if (stableMap.has(key) && !removedKeys.has(key)) {
          const existing = stableMap.get(key);
          const error = new Error(`Collision HOT: '${key}' est déjà utilisé par '${existing?.name || key}'.`);
          error.code = 'HOT_COMMAND_COLLISION';
          throw error;
        }
        candidateOwners.set(key, item.relativePath);
      }
    }
  }
}

function activateOnDisk(prepared) {
  const snapshots = new Map();
  for (const item of prepared) {
    snapshots.set(item.relativePath, snapshotFile(item.targetPath));
    try { delete require.cache[require.resolve(item.targetPath)]; } catch (_) {}
    if (item.action === 'delete') fs.rmSync(item.targetPath, { force: true });
    else atomicWrite(item.targetPath, item.source);
  }
  return snapshots;
}

function rollbackDisk(prepared, snapshots) {
  for (const item of prepared) {
    const snapshot = snapshots.get(item.relativePath);
    if (snapshot) restoreSnapshot(item.targetPath, snapshot);
  }
}

function loadActivatedCommands(prepared) {
  const byPath = new Map();
  for (const item of prepared) {
    if (item.action === 'delete') {
      byPath.set(item.relativePath, []);
      continue;
    }
    try { delete require.cache[require.resolve(item.targetPath)]; } catch (_) {}
    const exported = require(item.targetPath);
    const list = Array.isArray(exported) ? exported : [exported];
    const valid = list.filter(command => command && typeof command === 'object' && command.name && typeof command.execute === 'function');
    if (!valid.length) {
      const error = new Error(`La commande activée ${item.relativePath} n'exporte plus de commande valide.`);
      error.code = 'HOT_RUNTIME_LOAD_FAILED';
      throw error;
    }
    byPath.set(item.relativePath, valid);
  }
  return byPath;
}

function buildNextCommandMap(stableMap, prepared, activated) {
  const next = new Map(stableMap);
  for (const item of prepared) {
    for (const key of metadataKeys(item.oldMetadata)) next.delete(key);
  }
  for (const item of prepared) {
    for (const command of activated.get(item.relativePath) || []) {
      const nameKey = normalizeKey(command.name);
      if (!nameKey) continue;
      next.set(nameKey, command);
      for (const alias of Array.isArray(command.aliases) ? command.aliases : []) {
        const aliasKey = normalizeKey(alias);
        if (aliasKey) next.set(aliasKey, command);
      }
    }
  }
  return next;
}

function commitCommandMap(stableMap, nextMap) {
  stableMap.clear();
  for (const [key, command] of nextMap) stableMap.set(key, command);
  global.commands = stableMap;
  global._antispamMod = stableMap.get('antispam') || null;
  global._purificationMod = stableMap.get('purification') || null;
}

async function resolveDb(explicitDb) {
  if (explicitDb) return explicitDb;
  if (!process.env.MONGODB_URI) {
    const error = new Error('MongoDB est requis pour persister les mises à jour HOT.');
    error.code = 'HOT_NO_MONGODB';
    throw error;
  }
  return require('./mongoClient').getDb();
}

async function persistRelease(db, prepared, { commitSha = null, actor = 'github-actions' } = {}) {
  const now = new Date();
  const activeOps = prepared.map(item => ({
    updateOne: {
      filter: { _id: item.relativePath },
      update: {
        $set: {
          path: item.relativePath,
          action: item.action,
          deleted: item.action === 'delete',
          source: item.action === 'upsert' ? item.source : null,
          sha256: item.hash,
          metadata: item.metadata || null,
          commitSha: commitSha || null,
          updatedAt: now,
          actor,
        },
      },
      upsert: true,
    },
  }));
  const historyDocs = prepared.map(item => ({
    path: item.relativePath,
    action: item.action,
    deleted: item.action === 'delete',
    source: item.action === 'upsert' ? item.source : null,
    sha256: item.hash,
    metadata: item.metadata || null,
    commitSha: commitSha || null,
    actor,
    createdAt: now,
  }));

  await db.collection(ACTIVE_COLLECTION).bulkWrite(activeOps, { ordered: true });
  if (historyDocs.length) await db.collection(HISTORY_COLLECTION).insertMany(historyDocs, { ordered: true });
}

async function applyBatch(updates, options = {}) {
  const commandsRoot = options.commandsRoot || DEFAULT_COMMANDS_ROOT;
  const prepared = prepareUpdates(updates, commandsRoot);
  const staged = stageAndValidate(prepared);
  const stableMap = options.commandMap || getStableCommandMap();
  validateCollisions(prepared, stableMap);
  const oldMap = new Map(stableMap);
  let snapshots = null;

  try {
    const db = await resolveDb(options.db);
    snapshots = activateOnDisk(prepared);
    let activated;
    try {
      activated = loadActivatedCommands(prepared);
    } catch (error) {
      rollbackDisk(prepared, snapshots);
      const wrapped = new Error(`Activation HOT refusée, ancienne version conservée: ${error.message}`);
      wrapped.code = 'HOT_RUNTIME_LOAD_FAILED';
      throw wrapped;
    }

    const nextMap = buildNextCommandMap(stableMap, prepared, activated);
    commitCommandMap(stableMap, nextMap);

    try {
      await persistRelease(db, prepared, {
        commitSha: options.commitSha,
        actor: options.actor || 'github-actions',
      });
    } catch (error) {
      rollbackDisk(prepared, snapshots);
      commitCommandMap(stableMap, oldMap);
      const wrapped = new Error(`Persistance HOT échouée, ancienne version restaurée: ${error.message}`);
      wrapped.code = 'HOT_PERSIST_FAILED';
      throw wrapped;
    }

    return {
      success: true,
      commitSha: options.commitSha || null,
      commandKeys: stableMap.size,
      updates: prepared.map(item => ({
        path: item.relativePath,
        action: item.action,
        sha256: item.hash,
        commands: item.metadata?.commands || [],
      })),
    };
  } finally {
    for (const file of staged) {
      try { fs.rmSync(file, { force: true }); } catch (_) {}
    }
  }
}

function enqueueBatch(updates, options = {}) {
  const run = applyQueue.then(() => applyBatch(updates, options));
  applyQueue = run.catch(() => {});
  return run;
}

async function hydrateActiveCommands(options = {}) {
  const db = await resolveDb(options.db);
  const docs = await db.collection(ACTIVE_COLLECTION).find({}).sort({ _id: 1 }).toArray();
  if (!docs.length) return { success: true, restored: 0 };

  const updates = docs.map(doc => ({
    path: doc.path || doc._id,
    action: doc.deleted ? 'delete' : 'upsert',
    source: doc.source,
  }));

  const noopDb = {
    collection() {
      return {
        async bulkWrite() { return { ok: 1 }; },
        async insertMany() { return { acknowledged: true }; },
      };
    },
  };

  try {
    const result = await applyBatch(updates, {
      ...options,
      db: noopDb,
      actor: 'startup-hydration',
      commitSha: null,
    });
    return { success: true, restored: result.updates.length };
  } catch (error) {
    console.error('[hot-updater] restauration Mongo rejetée, commandes de base conservées:', error.message);
    return { success: false, restored: 0, error: error.message };
  }
}

async function getHotUpdateStatus(options = {}) {
  const db = await resolveDb(options.db);
  const docs = await db.collection(ACTIVE_COLLECTION)
    .find({}, { projection: { source: 0 } })
    .sort({ _id: 1 })
    .toArray();
  return docs.map(doc => ({
    path: doc.path || doc._id,
    action: doc.action,
    deleted: !!doc.deleted,
    sha256: doc.sha256 || null,
    commitSha: doc.commitSha || null,
    updatedAt: doc.updatedAt || null,
    commands: doc.metadata?.commands || [],
  }));
}

module.exports = {
  ACTIVE_COLLECTION,
  HISTORY_COLLECTION,
  MAX_BATCH,
  MAX_SOURCE_BYTES,
  isAuthorizedHotUpdate,
  normalizeCommandPath,
  prepareUpdates,
  applyBatch,
  enqueueBatch,
  hydrateActiveCommands,
  getHotUpdateStatus,
  _private: {
    sha256,
    metadataKeys,
    validateCollisions,
    buildNextCommandMap,
    commitCommandMap,
    runValidator,
  },
};