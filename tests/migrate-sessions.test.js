/**
 * Tests — scripts/migrate-sessions-to-hybrid.js (chantier "Architecture
 * hybride", Phase 3)
 *
 * Seed une fausse collection Mongo `auth_<sessionId>` avec des documents
 * creds + keys au même format que l'ancien utils/mongoAuth.js, exécute la
 * migration réelle, et vérifie : fichiers locaux corrects, idempotence,
 * non-écrasement d'une session déjà migrée, non-suppression de la
 * collection Mongo source, et gestion propre d'une session en échec sans
 * bloquer les autres.
 *
 * Lancer avec : node --test tests/
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeMongoClient } = require('./helpers/fakeMongoClient');

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://fake-host/test';

let _counter = 0;
function uniqueSessionId() {
  _counter++;
  return `session_2290000${String(_counter).padStart(3, '0')}`;
}

function loadMigrationScript() {
  delete require.cache[require.resolve('../utils/sessionIndex')];
  delete require.cache[require.resolve('../utils/fileAuthState')];
  delete require.cache[require.resolve('../scripts/migrate-sessions-to-hybrid')];
  const migration = require('../scripts/migrate-sessions-to-hybrid');
  const fileAuthState = require('../utils/fileAuthState');
  const sessionIndex = require('../utils/sessionIndex');
  return { migration, fileAuthState, sessionIndex };
}

/** Seed une collection auth_<sessionId> au format exact de l'ancien utils/mongoAuth.js. */
function seedLegacyAuthCollection(fakeDb, sessionId, { creds, keys = {} } = {}) {
  const col = fakeDb.collection(`auth_${sessionId}`);
  col._docs.set('creds', { _id: 'creds', value: JSON.stringify(creds || { registered: true, me: { id: `${sessionId}:1@s.whatsapp.net` } }) });
  for (const [docId, value] of Object.entries(keys)) {
    col._docs.set(docId, { _id: docId, value: JSON.stringify(value) });
  }
  return col;
}

test('migre une session legacy — creds + keys écrits localement, indexée dans Mongo', async (t) => {
  const { fakeDb, restore } = installFakeMongoClient();
  t.after(restore);
  const { migration, fileAuthState, sessionIndex } = loadMigrationScript();

  const sessionId = uniqueSessionId();
  t.after(() => fileAuthState.deleteSessionFiles(sessionId));

  seedLegacyAuthCollection(fakeDb, sessionId, {
    creds: { registered: true, me: { id: `${sessionId}:1@s.whatsapp.net`, name: 'Legacy User' } },
    keys: { 'pre-key-1': { keyPair: { public: 'abc' } }, 'session-xyz': { fake: 'data' } },
  });

  const result = await migration.migrateOneSession(fakeDb, sessionId);

  assert.equal(result, 'migrated');
  assert.ok(fileAuthState.sessionDirExists(sessionId), 'les credentials doivent être écrits localement');

  const { state } = await fileAuthState.useFileAuthState(sessionId);
  assert.equal(state.creds.me.name, 'Legacy User');

  const meta = await sessionIndex.getSessionMeta(sessionId);
  assert.ok(meta, 'la session doit être indexée dans Mongo après migration');
  assert.equal(meta.origin, 'migration');
});

test('ne supprime jamais la collection Mongo source (auth_*)', async (t) => {
  const { fakeDb, restore } = installFakeMongoClient();
  t.after(restore);
  const { migration, fileAuthState } = loadMigrationScript();

  const sessionId = uniqueSessionId();
  t.after(() => fileAuthState.deleteSessionFiles(sessionId));
  seedLegacyAuthCollection(fakeDb, sessionId);

  await migration.migrateOneSession(fakeDb, sessionId);

  const stillThere = await fakeDb.collection(`auth_${sessionId}`).findOne({ _id: 'creds' });
  assert.ok(stillThere, 'le document creds original doit toujours exister dans auth_<sessionId>');
});

test('idempotence — une session déjà migrée (dossier local présent) est ignorée, jamais écrasée', async (t) => {
  const { fakeDb, restore } = installFakeMongoClient();
  t.after(restore);
  const { migration, fileAuthState } = loadMigrationScript();

  const sessionId = uniqueSessionId();
  t.after(() => fileAuthState.deleteSessionFiles(sessionId));

  // Simule une session déjà migrée / déjà créée par le nouveau système.
  const first = await fileAuthState.useFileAuthState(sessionId);
  first.state.creds.me = { name: 'Already Migrated' };
  await first.saveCreds();

  seedLegacyAuthCollection(fakeDb, sessionId, { creds: { registered: true, me: { name: 'Should Not Overwrite' } } });

  const result = await migration.migrateOneSession(fakeDb, sessionId);
  assert.equal(result, 'skipped');

  const { state } = await fileAuthState.useFileAuthState(sessionId);
  assert.equal(state.creds.me.name, 'Already Migrated', 'les credentials locaux existants ne doivent jamais être écrasés');
});

test('idempotence — une deuxième exécution complète (main) ne remigre rien', async (t) => {
  const { fakeDb, restore } = installFakeMongoClient();
  t.after(restore);
  const { migration, fileAuthState, sessionIndex } = loadMigrationScript();

  const sessionId = uniqueSessionId();
  t.after(() => fileAuthState.deleteSessionFiles(sessionId));
  seedLegacyAuthCollection(fakeDb, sessionId);

  await migration.main();
  assert.ok(await sessionIndex.isMigrationDone(migration.MIGRATION_NAME), 'le drapeau global doit être posé après une migration réussie');

  // Deuxième session legacy ajoutée APRÈS la première exécution — pour
  // vérifier que le drapeau global empêche bien tout nouveau passage,
  // même si de nouvelles données "legacy" apparaissaient entre-temps.
  const secondSessionId = uniqueSessionId();
  t.after(() => fileAuthState.deleteSessionFiles(secondSessionId));
  seedLegacyAuthCollection(fakeDb, secondSessionId);

  await migration.main();
  assert.equal(fileAuthState.sessionDirExists(secondSessionId), false, 'le drapeau global empêche un second passage automatique');
});

test('session sans document "creds" exploitable — échoue proprement sans bloquer les autres', async (t) => {
  const { fakeDb, restore } = installFakeMongoClient();
  t.after(restore);
  const { migration, fileAuthState } = loadMigrationScript();

  const brokenId = uniqueSessionId();
  const validId = uniqueSessionId();
  t.after(() => Promise.all([brokenId, validId].map((id) => fileAuthState.deleteSessionFiles(id))));

  // Collection sans document "creds" du tout (corrompue / vide de sens).
  fakeDb.collection(`auth_${brokenId}`)._docs.set('pre-key-1', { _id: 'pre-key-1', value: '{}' });
  seedLegacyAuthCollection(fakeDb, validId);

  const brokenResult = await migration.migrateOneSession(fakeDb, brokenId);
  const validResult = await migration.migrateOneSession(fakeDb, validId);

  assert.equal(brokenResult, 'failed');
  assert.equal(validResult, 'migrated', 'la session valide doit être migrée malgré l\'échec de la précédente');
});

test('--dry-run n\'écrit rien et ne pose pas le drapeau de migration', async (t) => {
  const { fakeDb, restore } = installFakeMongoClient();
  t.after(restore);
  const { migration, fileAuthState, sessionIndex } = loadMigrationScript();

  const sessionId = uniqueSessionId();
  t.after(() => fileAuthState.deleteSessionFiles(sessionId));
  seedLegacyAuthCollection(fakeDb, sessionId);

  // DRY_RUN est lu depuis process.argv au chargement du module — on
  // simule l'argument CLI avant de recharger le script.
  const originalArgv = process.argv;
  process.argv = [...originalArgv, '--dry-run'];
  delete require.cache[require.resolve('../scripts/migrate-sessions-to-hybrid')];
  const dryRunMigration = require('../scripts/migrate-sessions-to-hybrid');
  process.argv = originalArgv;

  await dryRunMigration.main();

  assert.equal(fileAuthState.sessionDirExists(sessionId), false, 'aucun fichier ne doit être créé en mode --dry-run');
  assert.equal(await sessionIndex.isMigrationDone(dryRunMigration.MIGRATION_NAME), false, 'le drapeau ne doit pas être posé en mode --dry-run');
});
