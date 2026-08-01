/**
 * Tests — utils/fileAuthState.js (chantier "Architecture hybride", Phase 1)
 *
 * Exécute réellement useMultiFileAuthState (natif Baileys) sur un dossier
 * temporaire pour vérifier : création du dossier par session, présence de
 * creds.json, rechargement d'une session existante, suppression complète.
 *
 * Lancer avec : node --test tests/
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// SESSIONS_ROOT est calculé depuis process.cwd() au chargement du module —
// on se place dans un dossier temporaire avant de (re)charger le module à
// chaque test pour ne jamais toucher au vrai dossier sessions/ du projet.
function freshFileAuthState(cwd) {
  const prevCwd = process.cwd();
  process.chdir(cwd);
  delete require.cache[require.resolve('../utils/fileAuthState')];
  const mod = require('../utils/fileAuthState');
  process.chdir(prevCwd);
  return mod;
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dipper-fileauth-'));
}

test('useFileAuthState crée un dossier dédié par session avec creds.json', async (t) => {
  const tmp = makeTmpDir();
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { useFileAuthState, getSessionDir } = freshFileAuthState(tmp);

  const sessionId = 'session_22912345678';
  const { state, saveCreds } = await useFileAuthState(sessionId);
  await saveCreds();

  const dir = getSessionDir(sessionId);
  assert.equal(dir, path.join(tmp, 'sessions', sessionId));
  assert.ok(fs.existsSync(dir), 'le dossier de la session doit exister');
  assert.ok(fs.existsSync(path.join(dir, 'creds.json')), 'creds.json doit avoir été écrit');
  assert.ok(state.creds, 'un objet creds doit être renvoyé (nouveau ou rechargé)');
});

test('deux sessions différentes ont deux dossiers strictement isolés', async (t) => {
  const tmp = makeTmpDir();
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { useFileAuthState, getSessionDir } = freshFileAuthState(tmp);

  const a = await useFileAuthState('session_111');
  const b = await useFileAuthState('session_222');
  await a.saveCreds();
  await b.saveCreds();

  assert.notEqual(getSessionDir('session_111'), getSessionDir('session_222'));
  assert.ok(fs.existsSync(path.join(getSessionDir('session_111'), 'creds.json')));
  assert.ok(fs.existsSync(path.join(getSessionDir('session_222'), 'creds.json')));
});

test('sessionDirExists détecte correctement une session déjà créée', async (t) => {
  const tmp = makeTmpDir();
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { useFileAuthState, sessionDirExists } = freshFileAuthState(tmp);

  assert.equal(sessionDirExists('session_999'), false);
  const { saveCreds } = await useFileAuthState('session_999');
  await saveCreds();
  assert.equal(sessionDirExists('session_999'), true);
});

test('listLocalSessionIds retourne uniquement les dossiers avec creds.json valides', async (t) => {
  const tmp = makeTmpDir();
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { useFileAuthState, listLocalSessionIds, SESSIONS_ROOT } = freshFileAuthState(tmp);

  await (await useFileAuthState('session_aaa')).saveCreds();
  await (await useFileAuthState('session_bbb')).saveCreds();
  // Dossier vide (aucun creds.json) — ne doit pas être listé comme session valide.
  fs.mkdirSync(path.join(SESSIONS_ROOT, 'session_incomplete'), { recursive: true });

  const ids = listLocalSessionIds().sort();
  assert.deepEqual(ids, ['session_aaa', 'session_bbb']);
});

test('deleteSessionFiles supprime intégralement le dossier de la session', async (t) => {
  const tmp = makeTmpDir();
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { useFileAuthState, deleteSessionFiles, sessionDirExists } = freshFileAuthState(tmp);

  await (await useFileAuthState('session_to_delete')).saveCreds();
  assert.equal(sessionDirExists('session_to_delete'), true);

  await deleteSessionFiles('session_to_delete');
  assert.equal(sessionDirExists('session_to_delete'), false);
});

test('rechargement — une session déjà appairée conserve ses creds après une nouvelle ouverture', async (t) => {
  const tmp = makeTmpDir();
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const { useFileAuthState } = freshFileAuthState(tmp);

  const first = await useFileAuthState('session_reload');
  first.state.creds.me = { id: '22912345678:1@s.whatsapp.net', name: 'Test' };
  await first.saveCreds();

  // Simule un redémarrage : on rouvre l'auth state pour le même sessionId.
  const second = await useFileAuthState('session_reload');
  assert.deepEqual(second.state.creds.me, { id: '22912345678:1@s.whatsapp.net', name: 'Test' });
});
