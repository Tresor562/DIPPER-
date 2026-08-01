/**
 * Tests — validation bout-en-bout des 3 canaux de pairing (chantier
 * "Architecture hybride", Phase 4)
 *
 * Le bot Telegram et le site Web sont des projets externes, non présents
 * dans ce dépôt — ce fichier ne les modifie ni ne les simule dans leur
 * intégralité. Il valide plutôt le seul point de contact réel entre eux et
 * ce projet : POST /pair (api/server.js), avec les valeurs d'origin/owner
 * que chacun enverrait, pour prouver que la pile complète (HTTP → 
 * pairingService → sessionManager → fileAuthState/sessionIndex) fonctionne
 * correctement pour chacun des 3 canaux, avec l'architecture hybride en
 * place. Le canal WhatsApp (commande .pair) est testé directement via
 * pairingService.createPairingSession(), exactement comme
 * commands/bot_sovereignty/pair.js l'appelle (non modifié par ce chantier).
 *
 * Lancer avec : node --test tests/
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { installFakeMongoClient } = require('./helpers/fakeMongoClient');
const { installFakeBaileys } = require('./helpers/fakeBaileys');

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://fake-host/test';

let _counter = 0;
function uniquePhone() {
  _counter++;
  return `2280000${String(_counter).padStart(4, '0')}`;
}

/** (Ré)installe les doubles et recharge toute la pile fraîche. */
function loadStack() {
  const baileys = installFakeBaileys();
  for (const p of ['../utils/sessionIndex', '../utils/fileAuthState', '../utils/sessionManager', '../utils/pairingService', '../api/server']) {
    delete require.cache[require.resolve(p)];
  }
  const pairingService = require('../utils/pairingService');
  const { startApiServer } = require('../api/server');
  const sessionManager = require('../utils/sessionManager');
  const fileAuthState = require('../utils/fileAuthState');
  const sessionIndex = require('../utils/sessionIndex');
  return { ...baileys, pairingService, startApiServer, sessionManager, fileAuthState, sessionIndex };
}

function httpPostPair(port, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { host: '127.0.0.1', port, method: 'POST', path: '/pair',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(raw) }));
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

test('Pairing depuis WhatsApp (.pair) — appel direct de pairingService, comme commands/bot_sovereignty/pair.js', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { pairingService, sessionManager, fileAuthState, sessionIndex, recordedSockets, restore: restoreBaileys } = loadStack();
  t.after(restoreBaileys);

  const phone = uniquePhone();
  const sessionId = sessionManager.toSessionId(phone);
  t.after(async () => { await sessionManager.stopSession(phone); await fileAuthState.deleteSessionFiles(sessionId); });

  // Appel EXACTEMENT comme pair.js le fait aujourd'hui : requesterKey =
  // JID de l'expéditeur, aucun origin/owner explicite.
  const result = await pairingService.createPairingSession(phone, { requesterKey: '22900000000@s.whatsapp.net' });
  await recordedSockets[0].ev._trigger('creds.update'); // simule Baileys persistant les creds pendant le handshake de pairing

  assert.equal(result.sessionId, sessionId);
  assert.ok(result.pairingCode, 'un code de pairing doit être retourné');
  assert.equal(result.reconnected, false);

  const meta = await sessionIndex.getSessionMeta(sessionId);
  assert.equal(meta.origin, 'whatsapp', 'origin doit être déduit à whatsapp par défaut pour cet appelant');
  assert.equal(meta.owner, '22900000000@s.whatsapp.net');
  assert.ok(fileAuthState.sessionDirExists(sessionId), 'les credentials doivent être stockés localement (architecture hybride)');
});

test('Pairing depuis Telegram (via API) — origin/owner transmis explicitement', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { startApiServer, sessionManager, fileAuthState, sessionIndex, restore: restoreBaileys } = loadStack();
  t.after(restoreBaileys);

  const server = startApiServer(0);
  t.after(() => new Promise((r) => server.close(r)));
  await new Promise((r) => server.on('listening', r));

  const phone = uniquePhone();
  const sessionId = sessionManager.toSessionId(phone);
  t.after(async () => { await sessionManager.stopSession(phone); await fileAuthState.deleteSessionFiles(sessionId); });

  const res = await httpPostPair(server.address().port, { phoneNumber: phone, origin: 'telegram', owner: 'tg_user_555' });

  assert.equal(res.status, 200);
  assert.ok(res.json.pairingCode);

  const meta = await sessionIndex.getSessionMeta(sessionId);
  assert.equal(meta.origin, 'telegram');
  assert.equal(meta.owner, 'tg_user_555');
});

test('Pairing depuis le Site Web (via API) — origin/owner transmis explicitement', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { startApiServer, sessionManager, fileAuthState, sessionIndex, restore: restoreBaileys } = loadStack();
  t.after(restoreBaileys);

  const server = startApiServer(0);
  t.after(() => new Promise((r) => server.close(r)));
  await new Promise((r) => server.on('listening', r));

  const phone = uniquePhone();
  const sessionId = sessionManager.toSessionId(phone);
  t.after(async () => { await sessionManager.stopSession(phone); await fileAuthState.deleteSessionFiles(sessionId); });

  const res = await httpPostPair(server.address().port, { phoneNumber: phone, origin: 'web', owner: 'web_session_abc123' });

  assert.equal(res.status, 200);
  assert.ok(res.json.pairingCode);

  const meta = await sessionIndex.getSessionMeta(sessionId);
  assert.equal(meta.origin, 'web');
  assert.equal(meta.owner, 'web_session_abc123');
});

test('Appelant HTTP non mis à jour (sans origin/owner) — rétrocompatibilité, defaults sûrs', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { startApiServer, sessionManager, fileAuthState, sessionIndex, restore: restoreBaileys } = loadStack();
  t.after(restoreBaileys);

  const server = startApiServer(0);
  t.after(() => new Promise((r) => server.close(r)));
  await new Promise((r) => server.on('listening', r));

  const phone = uniquePhone();
  const sessionId = sessionManager.toSessionId(phone);
  t.after(async () => { await sessionManager.stopSession(phone); await fileAuthState.deleteSessionFiles(sessionId); });

  // Requête minimale — exactement ce qu'envoient aujourd'hui le bot
  // Telegram et le site Web tant qu'ils n'ont pas été mis à jour.
  const res = await httpPostPair(server.address().port, { phoneNumber: phone });

  assert.equal(res.status, 200);
  const meta = await sessionIndex.getSessionMeta(sessionId);
  assert.equal(meta.origin, 'api', 'défaut sûr pour un appelant HTTP non identifié');
  assert.ok(meta.owner && meta.owner !== 'unknown', 'owner doit retomber sur l\'IP de l\'appelant');
});

test('Reconnexion — session déjà appairée localement, quel que soit le canal', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { pairingService, sessionManager, fileAuthState, restore: restoreBaileys } = loadStack();
  t.after(restoreBaileys);

  const phone = uniquePhone();
  const sessionId = sessionManager.toSessionId(phone);
  t.after(async () => { await sessionManager.stopSession(phone); await fileAuthState.deleteSessionFiles(sessionId); });

  // Simule des credentials déjà appairés (comme après un premier pairing réussi).
  const pre = await fileAuthState.useFileAuthState(sessionId);
  pre.state.creds.registered = true;
  await pre.saveCreds();

  const result = await pairingService.createPairingSession(phone, { requesterKey: 'whoever@s.whatsapp.net' });

  assert.equal(result.reconnected, true);
  assert.equal(result.pairingCode, null, 'aucun nouveau code — la session se reconnecte avec ses credentials existants');
});

test('Anti-abus — cooldown partagé par requesterKey, tous canaux confondus', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { startApiServer, sessionManager, fileAuthState, restore: restoreBaileys } = loadStack();
  t.after(restoreBaileys);

  const server = startApiServer(0);
  t.after(() => new Promise((r) => server.close(r)));
  await new Promise((r) => server.on('listening', r));

  const phone1 = uniquePhone();
  const phone2 = uniquePhone();
  t.after(async () => {
    await sessionManager.stopSession(phone1);
    await sessionManager.stopSession(phone2);
    await fileAuthState.deleteSessionFiles(sessionManager.toSessionId(phone1));
    await fileAuthState.deleteSessionFiles(sessionManager.toSessionId(phone2));
  });

  const first = await httpPostPair(server.address().port, { phoneNumber: phone1 });
  assert.equal(first.status, 200);

  // Même IP appelante (127.0.0.1 en test) = même requesterKey, un numéro
  // différent — le cooldown est bien scopé par demandeur, pas par numéro.
  const second = await httpPostPair(server.address().port, { phoneNumber: phone2 });
  assert.equal(second.status, 429);
  assert.equal(second.json.error, 'COOLDOWN');
});

test('ALREADY_ACTIVE — une session déjà en ligne ne peut pas être recréée par-dessus', async (t) => {
  const { fakeDb, restore: restoreMongo } = installFakeMongoClient();
  t.after(restoreMongo);
  const { pairingService, sessionManager, fileAuthState, recordedSockets, restore: restoreBaileys } = loadStack();
  t.after(restoreBaileys);

  const phone = uniquePhone();
  const sessionId = sessionManager.toSessionId(phone);
  t.after(async () => { await sessionManager.stopSession(phone); await fileAuthState.deleteSessionFiles(sessionId); });

  await pairingService.createPairingSession(phone, { requesterKey: 'req-1' });
  await recordedSockets[0].ev._trigger('connection.update', { connection: 'open', isNewLogin: true });

  await assert.rejects(
    () => pairingService.createPairingSession(phone, { requesterKey: 'req-2' }),
    (err) => err.code === 'ALREADY_ACTIVE'
  );
});
