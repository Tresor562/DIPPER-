/**
 * Tests — utils/sessionIndex.js (chantier "Architecture hybride", Phase 1)
 *
 * Vérifie le CRUD réel des métadonnées de session (pas les credentials
 * Baileys — voir tests/file-auth-state.test.js) : création idempotente,
 * mise à jour d'état, activité, statistiques, suppression, et les
 * drapeaux de migration one-shot.
 *
 * Utilise un double MongoDB en mémoire (tests/helpers/fakeMongoClient.js)
 * injecté dans le cache require avant chargement de sessionIndex.js — le
 * comportement CRUD testé est réel, seul le backend de stockage est
 * remplacé (pas d'accès réseau nécessaire).
 *
 * Lancer avec : node --test tests/
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeMongoClient } = require('./helpers/fakeMongoClient');

function freshSessionIndex() {
  const { fakeDb, restore } = installFakeMongoClient();
  delete require.cache[require.resolve('../utils/sessionIndex')];
  const sessionIndex = require('../utils/sessionIndex');
  return { sessionIndex, fakeDb, restore };
}

test('ensureSession crée une nouvelle entrée avec les valeurs par défaut', async (t) => {
  const { sessionIndex, restore } = freshSessionIndex();
  t.after(restore);

  const doc = await sessionIndex.ensureSession('session_111', {
    phoneNumber: '22911111111',
    owner: '22900000000@s.whatsapp.net',
    origin: 'whatsapp',
  });

  assert.equal(doc.sessionId, 'session_111');
  assert.equal(doc.phoneNumber, '22911111111');
  assert.equal(doc.owner, '22900000000@s.whatsapp.net');
  assert.equal(doc.origin, 'whatsapp');
  assert.equal(doc.state.isOnline, false);
  assert.equal(doc.state.isRegistered, false);
  assert.equal(doc.stats.reconnectCount, 0);
  assert.ok(doc.createdAt);
  assert.ok(doc.lastActivity);
});

test('ensureSession est idempotent — ne réécrase pas owner/origin/createdAt existants', async (t) => {
  const { sessionIndex, restore } = freshSessionIndex();
  t.after(restore);

  const first = await sessionIndex.ensureSession('session_222', {
    phoneNumber: '22922222222',
    owner: 'original-owner',
    origin: 'whatsapp',
  });

  // Deuxième appel (ex: reconnexion) avec des métadonnées différentes —
  // ne doit rien écraser de ce qui existe déjà.
  const second = await sessionIndex.ensureSession('session_222', {
    phoneNumber: '22922222222',
    owner: 'should-be-ignored',
    origin: 'api',
  });

  assert.equal(second.owner, 'original-owner');
  assert.equal(second.origin, 'whatsapp');
  assert.equal(second.createdAt, first.createdAt);
});

test('métadonnées manquantes -> valeurs par défaut "unknown" (compatibilité canaux externes)', async (t) => {
  const { sessionIndex, restore } = freshSessionIndex();
  t.after(restore);

  const doc = await sessionIndex.ensureSession('session_333');
  assert.equal(doc.owner, 'unknown');
  assert.equal(doc.origin, 'unknown');
  assert.equal(doc.phoneNumber, null);
});

test('setState met à jour isOnline/isRegistered sans toucher au reste', async (t) => {
  const { sessionIndex, restore } = freshSessionIndex();
  t.after(restore);

  await sessionIndex.ensureSession('session_444', { phoneNumber: '229', owner: 'o', origin: 'whatsapp' });
  await sessionIndex.setState('session_444', { isOnline: true, isRegistered: true });

  const doc = await sessionIndex.getSessionMeta('session_444');
  assert.equal(doc.state.isOnline, true);
  assert.equal(doc.state.isRegistered, true);
  assert.equal(doc.owner, 'o'); // inchangé
});

test('incrementStat incrémente correctement un compteur', async (t) => {
  const { sessionIndex, restore } = freshSessionIndex();
  t.after(restore);

  await sessionIndex.ensureSession('session_555');
  await sessionIndex.incrementStat('session_555', 'reconnectCount');
  await sessionIndex.incrementStat('session_555', 'reconnectCount');
  await sessionIndex.incrementStat('session_555', 'reconnectCount', 3);

  const doc = await sessionIndex.getSessionMeta('session_555');
  assert.equal(doc.stats.reconnectCount, 5);
});

test('listSessions retourne toutes les sessions indexées', async (t) => {
  const { sessionIndex, restore } = freshSessionIndex();
  t.after(restore);

  await sessionIndex.ensureSession('session_a');
  await sessionIndex.ensureSession('session_b');
  await sessionIndex.ensureSession('session_c');

  const all = await sessionIndex.listSessions();
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((s) => s.sessionId).sort(), ['session_a', 'session_b', 'session_c']);
});

test('deleteSessionMeta supprime bien l\'entrée', async (t) => {
  const { sessionIndex, restore } = freshSessionIndex();
  t.after(restore);

  await sessionIndex.ensureSession('session_to_delete');
  assert.ok(await sessionIndex.getSessionMeta('session_to_delete'));

  await sessionIndex.deleteSessionMeta('session_to_delete');
  assert.equal(await sessionIndex.getSessionMeta('session_to_delete'), null);
});

test('drapeau de migration one-shot — isMigrationDone / markMigrationDone', async (t) => {
  const { sessionIndex, restore } = freshSessionIndex();
  t.after(restore);

  assert.equal(await sessionIndex.isMigrationDone('hybrid-storage-v1'), false);

  await sessionIndex.markMigrationDone('hybrid-storage-v1', { migratedCount: 4 });

  assert.equal(await sessionIndex.isMigrationDone('hybrid-storage-v1'), true);
});
