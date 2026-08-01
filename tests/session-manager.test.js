/**
 * Tests — utils/sessionManager.js (chantier "Architecture hybride", Phase 2)
 *
 * Vérifie l'intégration réelle de fileAuthState.js + sessionIndex.js dans
 * sessionManager.js : création de session, plusieurs sessions simultanées,
 * suppression, et surtout la reconnexion après un "redémarrage" simulé
 * (nouvelle instance de sessionManager — Map activeSessions vide — qui doit
 * retrouver ses sessions via l'index Mongo + les dossiers locaux réels).
 *
 * Ne se connecte jamais à un vrai serveur WhatsApp (impossible/indésirable
 * en test automatisé) : @whiskeysockets/baileys est remplacé par un double
 * (tests/helpers/fakeBaileys.js) qui expose un vrai useMultiFileAuthState
 * (donc de vrais fichiers écrits sur disque) et un socket factice dont le
 * test déclenche lui-même les événements 'connection.update'. MongoDB est
 * remplacé par le double en mémoire de la Phase 1
 * (tests/helpers/fakeMongoClient.js).
 *
 * Nettoyage : chaque test supprime ses propres dossiers sous sessions/ à la
 * fin (t.after) — aucun artefact laissé après exécution.
 *
 * Lancer avec : node --test tests/
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakeMongoClient } = require('./helpers/fakeMongoClient');
const { installFakeBaileys } = require('./helpers/fakeBaileys');

let _counter = 0;
function uniquePhone() {
  _counter++;
  return `22900000${String(_counter).padStart(3, '0')}`;
}

/** (Ré)installe le double Baileys, vide le cache sessionManager.js, et le recharge. */
function loadSessionManager({ freshSessionIndex = true } = {}) {
  const baileys = installFakeBaileys();
  if (freshSessionIndex) {
    delete require.cache[require.resolve('../utils/sessionIndex')];
    delete require.cache[require.resolve('../utils/fileAuthState')];
  }
  delete require.cache[require.resolve('../utils/sessionManager')];
  const sessionManager = require('../utils/sessionManager');
  const fileAuthState = require('../utils/fileAuthState');
  return { sessionManager, fileAuthState, ...baileys };
}

test('création d\'une session — dossier local + entrée Mongo créés avec owner/origin', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { sessionManager, fileAuthState, recordedSockets, restore: restoreBaileys } = loadSessionManager();
  t.after(restoreBaileys);

  const phone = uniquePhone();
  const sessionId = sessionManager.toSessionId(phone);
  t.after(async () => { await sessionManager.stopSession(phone); await fileAuthState.deleteSessionFiles(sessionId); });

  const session = await sessionManager.startSession(fakeDb, phone, {
    isPairing: true, owner: 'test-owner-1', origin: 'whatsapp',
  });
  await recordedSockets[0].ev._trigger('connection.update', { connection: 'open', isNewLogin: true });
  await recordedSockets[0].ev._trigger('creds.update'); // simule Baileys sauvegardant les creds réelles

  assert.equal(session.sessionId, sessionId);
  assert.ok(fileAuthState.sessionDirExists(sessionId), 'le dossier local de credentials doit exister');
  assert.ok(sessionManager.getSession(phone)?.isOnline, 'la session doit être marquée en ligne');

  const meta = await require('../utils/sessionIndex').getSessionMeta(sessionId);
  assert.equal(meta.owner, 'test-owner-1');
  assert.equal(meta.origin, 'whatsapp');
  assert.equal(meta.state.isOnline, true);
});

test('plusieurs sessions simultanées — isolation stricte', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { sessionManager, fileAuthState, restore: restoreBaileys } = loadSessionManager();
  t.after(restoreBaileys);

  const phones = [uniquePhone(), uniquePhone(), uniquePhone()];
  t.after(() => Promise.all(phones.map(async (p) => {
    await sessionManager.stopSession(p);
    await fileAuthState.deleteSessionFiles(sessionManager.toSessionId(p));
  })));

  for (const phone of phones) {
    await sessionManager.startSession(fakeDb, phone, { isPairing: true, owner: 'multi-owner', origin: 'whatsapp' });
  }

  assert.equal(sessionManager.getAllSessions().length, 3);
  const dirs = phones.map((p) => fileAuthState.getSessionDir(sessionManager.toSessionId(p)));
  assert.equal(new Set(dirs).size, 3, 'chaque session doit avoir un dossier distinct');
});

test('suppression d\'une session — déconnecte mais conserve credentials + index (comportement inchangé)', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { sessionManager, fileAuthState, recordedSockets, restore: restoreBaileys } = loadSessionManager();
  t.after(restoreBaileys);

  const phone = uniquePhone();
  const sessionId = sessionManager.toSessionId(phone);
  t.after(() => fileAuthState.deleteSessionFiles(sessionId));

  await sessionManager.startSession(fakeDb, phone, { isPairing: true, owner: 'o', origin: 'whatsapp' });
  await recordedSockets[0].ev._trigger('connection.update', { connection: 'open', isNewLogin: true });
  await recordedSockets[0].ev._trigger('creds.update'); // simule Baileys sauvegardant les creds réelles

  const stopped = await sessionManager.stopSession(phone);
  assert.equal(stopped, true);
  assert.equal(sessionManager.getSession(phone), null, 'plus en mémoire');
  assert.ok(fileAuthState.sessionDirExists(sessionId), 'les fichiers de credentials doivent être conservés');

  const meta = await require('../utils/sessionIndex').getSessionMeta(sessionId);
  assert.ok(meta, 'l\'entrée Mongo doit être conservée');
  assert.equal(meta.state.isOnline, false);
});

test('reconnexion après redémarrage — nouvelle instance de sessionManager recharge depuis Mongo + fichiers locaux', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);

  // ── "Avant redémarrage" : une session est créée et connectée ───────────
  const before = loadSessionManager();
  const phone = uniquePhone();
  const sessionId = before.sessionManager.toSessionId(phone);
  t.after(() => before.fileAuthState.deleteSessionFiles(sessionId));

  await before.sessionManager.startSession(fakeDb, phone, { isPairing: true, owner: 'restart-owner', origin: 'whatsapp' });
  await before.recordedSockets[0].ev._trigger('connection.update', { connection: 'open', isNewLogin: true });
  await before.recordedSockets[0].ev._trigger('creds.update');
  await before.sessionManager.stopSession(phone); // libère le timer heartbeat de "avant redémarrage"
  before.restore(); // ferme le double baileys "avant redémarrage"

  // ── "Redémarrage" : nouvelle instance de sessionManager (Map activeSessions
  // vide), mais MÊME fakeDb Mongo (persistant) et MÊMES fichiers réels sur
  // disque (déjà écrits ci-dessus) — sessionIndex/fileAuthState ne sont PAS
  // rechargés (ils n'ont pas d'état propre, seulement des accès à Mongo/fs) ──
  const after = loadSessionManager({ freshSessionIndex: false });
  t.after(async () => { await after.sessionManager.stopSession(phone); after.restore(); });

  assert.equal(after.sessionManager.getSession(phone), null, 'rien en mémoire juste après le "redémarrage"');

  await after.sessionManager.loadAllSessions(fakeDb);

  const reloaded = after.sessionManager.getSession(phone);
  assert.ok(reloaded, 'la session doit avoir été retrouvée et reconnectée automatiquement');
  assert.equal(reloaded.sessionId, sessionId);
});

test('restauration complète — plusieurs sessions survivent toutes à un redémarrage', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);

  const before = loadSessionManager();
  const phones = [uniquePhone(), uniquePhone(), uniquePhone()];
  t.after(() => Promise.all(phones.map((p) => before.fileAuthState.deleteSessionFiles(before.sessionManager.toSessionId(p)))));

  for (let i = 0; i < phones.length; i++) {
    await before.sessionManager.startSession(fakeDb, phones[i], { isPairing: true, owner: `o${i}`, origin: 'whatsapp' });
    await before.recordedSockets[i].ev._trigger('connection.update', { connection: 'open', isNewLogin: true });
    await before.recordedSockets[i].ev._trigger('creds.update');
  }
  await Promise.all(phones.map((p) => before.sessionManager.stopSession(p)));
  before.restore();

  const after = loadSessionManager({ freshSessionIndex: false });
  t.after(async () => { await Promise.all(phones.map((p) => after.sessionManager.stopSession(p))); after.restore(); });

  await after.sessionManager.loadAllSessions(fakeDb);

  assert.equal(after.sessionManager.getAllSessions().length, 3, 'aucune session ne doit être oubliée');
  for (const phone of phones) {
    assert.ok(after.sessionManager.getSession(phone), `${phone} doit être reconnectée`);
  }
});

test('session indexée dans Mongo mais sans dossier local — ignorée proprement, ne bloque pas les autres', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { sessionManager, fileAuthState, recordedSockets, restore: restoreBaileys } = loadSessionManager();
  t.after(restoreBaileys);

  // Session normale, avec fichiers.
  const validPhone = uniquePhone();
  t.after(() => fileAuthState.deleteSessionFiles(sessionManager.toSessionId(validPhone)));
  await sessionManager.startSession(fakeDb, validPhone, { isPairing: true, owner: 'o', origin: 'whatsapp' });
  await recordedSockets[0].ev._trigger('connection.update', { connection: 'open', isNewLogin: true });
  await recordedSockets[0].ev._trigger('creds.update'); // simule Baileys sauvegardant les creds réelles
  await sessionManager.stopSession(validPhone); // reste indexée, juste hors mémoire

  // Session "fantôme" : entrée Mongo créée directement, sans jamais créer de
  // fichiers locaux (simule un index désynchronisé — disque perdu, etc.).
  const sessionIndex = require('../utils/sessionIndex');
  const ghostPhone = uniquePhone();
  const ghostSessionId = sessionManager.toSessionId(ghostPhone);
  await sessionIndex.ensureSession(ghostSessionId, { phoneNumber: ghostPhone, owner: 'ghost', origin: 'whatsapp' });

  await sessionManager.loadAllSessions(fakeDb);

  assert.ok(sessionManager.getSession(validPhone), 'la session valide doit être reconnectée malgré la session fantôme');
  assert.equal(sessionManager.getSession(ghostPhone), null, 'la session fantôme ne doit pas planter le chargement, juste être ignorée');
  await sessionManager.stopSession(validPhone); // libère le timer heartbeat de la reconnexion
});
