'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { routeMessage } = require('../ai_chat/router/socialRouter');
const { PersistentScheduler } = require('../ai_chat/scheduler/persistentScheduler');
const { DynamicCommandRegistry } = require('../ai_chat/dynamic/registry');
const { GameMaster } = require('../ai_chat/games/gameMaster');
const { createExaucee, safeSessionId } = require('../ai_chat/core');
const { sanitizeModelText, sendExaucee } = require('../ai_chat/runtime');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'exaucee-'));
}

function message({ text = '', chat = '123@g.us', mentions = [], quotedId = null, fromMe = false } = {}) {
  return {
    key: { id: `m_${Math.random()}`, remoteJid: chat, fromMe },
    message: {
      extendedTextMessage: {
        text,
        contextInfo: {
          mentionedJid: mentions,
          ...(quotedId ? { stanzaId: quotedId } : {})
        }
      }
    }
  };
}

test('mention du JID alternatif du bot déclenche Exaucée', () => {
  const result = routeMessage({
    msg: message({ text: '@22997000000 tu es là ?', mentions: ['22997000000@s.whatsapp.net'] }),
    botJids: ['188055763857491@lid', '22997000000@s.whatsapp.net']
  });
  assert.equal(result.shouldRespond, true);
  assert.equal(result.reason, 'explicit-mention');
});

test('prise en main humaine coupe les réponses automatiques en privé', () => {
  const result = routeMessage({
    msg: message({ text: 'continue', chat: '22911111111@s.whatsapp.net' }),
    humanTakeover: true
  });
  assert.equal(result.shouldRespond, false);
  assert.equal(result.reason, 'human-takeover');
});

test('nom explicite Exaucée reprend malgré le takeover humain', () => {
  const result = routeMessage({
    msg: message({ text: 'Exaucée, reprends', chat: '22911111111@s.whatsapp.net' }),
    humanTakeover: true
  });
  assert.equal(result.shouldRespond, true);
});

test('Exaucée en privé envoie sans quoted pour éviter les messages silencieux Baileys', async () => {
  const calls = [];
  const sock = {
    async sendMessage(...args) {
      calls.push(args);
      return { key: { id: 'private-1' } };
    }
  };
  const exaucee = { markOwnMessage() {} };
  const msg = message({ chat: '22911111111@s.whatsapp.net', text: 'salut' });
  await sendExaucee(sock, exaucee, msg.key.remoteJid, msg, 'Bonjour 🌸');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  assert.deepEqual(calls[0][1], { text: 'Bonjour 🌸' });
});

test('Exaucée en groupe conserve quoted et retombe sans quoted si nécessaire', async () => {
  const calls = [];
  const sock = {
    async sendMessage(...args) {
      calls.push(args);
      if (calls.length === 1) throw new Error('quoted rejected');
      return { key: { id: 'group-1' } };
    }
  };
  const exaucee = { markOwnMessage() {} };
  const msg = message({ chat: '123@g.us', text: 'salut' });
  await sendExaucee(sock, exaucee, msg.key.remoteJid, msg, 'Bonjour groupe');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][2], { quoted: msg });
  assert.equal(calls[1].length, 2);
});

test('scheduler persiste puis exécute une tâche due', async () => {
  const root = makeTmp();
  const file = path.join(root, 'tasks.json');
  const first = new PersistentScheduler({ file });
  first.schedule({ id: 'r1', runAt: Date.now() - 1, action: { type: 'send_message', text: 'bonjour' } });

  const restarted = new PersistentScheduler({ file });
  let executed = null;
  restarted.runner = async task => {
    executed = task.id;
    return { ok: true };
  };
  await restarted.tick();

  assert.equal(executed, 'r1');
  assert.equal(restarted.list()[0].status, 'done');
  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(disk[0].status, 'done');
});

test('scheduler retente puis marque failed après maxAttempts', async () => {
  const root = makeTmp();
  const file = path.join(root, 'tasks.json');
  const scheduler = new PersistentScheduler({ file });
  scheduler.schedule({ id: 'bad', runAt: Date.now() - 1, maxAttempts: 1, action: { type: 'x' } });
  scheduler.runner = async () => { throw new Error('boom'); };
  await scheduler.tick();
  const task = scheduler.list()[0];
  assert.equal(task.status, 'failed');
  assert.equal(task.attempts, 1);
  assert.match(task.lastError, /boom/);
});

test('commandes dynamiques survivent à un redémarrage', () => {
  const root = makeTmp();
  const file = path.join(root, 'dynamic.json');
  const first = new DynamicCommandRegistry({ file });
  first.define('s1', { name: 'hello', groupId: 'g@g.us', workflow: { type: 'reply', text: 'salut' } });

  const restarted = new DynamicCommandRegistry({ file });
  assert.equal(restarted.get('s1', 'hello', { groupId: 'g@g.us' }).workflow.text, 'salut');
  assert.equal(restarted.get('s1', 'hello', { groupId: 'other@g.us' }), null);
});

test('deux sessions Exaucée ont des fichiers d’état distincts', () => {
  const root = makeTmp();
  const a = createExaucee({ sessionId: 'alpha', root, config: { enabled: false } });
  const b = createExaucee({ sessionId: 'beta', root, config: { enabled: false } });
  a.scheduler.schedule({ id: 'only-a', runAt: Date.now() + 99999, action: { type: 'noop' } });
  b.scheduler.schedule({ id: 'only-b', runAt: Date.now() + 99999, action: { type: 'noop' } });
  assert.deepEqual(a.scheduler.list().map(x => x.id), ['only-a']);
  assert.deepEqual(b.scheduler.list().map(x => x.id), ['only-b']);
});

test('Game Master termine un quiz et conserve le score après redémarrage', () => {
  const root = makeTmp();
  const file = path.join(root, 'games.json');
  const games = new GameMaster({ file });
  const started = games.startQuiz('g@g.us', { by: 'u1@s.whatsapp.net', category: 'general', rounds: 1 });
  const current = started.game.questions[0];
  const result = games.answerQuiz('g@g.us', 'u1@s.whatsapp.net', current.a[0]);
  assert.equal(result.correct, true);
  assert.equal(result.finished, true);
  assert.equal(result.scores['u1@s.whatsapp.net'], 1);

  const restarted = new GameMaster({ file });
  assert.equal(restarted.get('g@g.us').status, 'finished');
  assert.equal(restarted.scoreboard('g@g.us')[0].score, 1);
});

test('Game Master Action/Vérité garde un historique sûr', () => {
  const root = makeTmp();
  const gameMaster = new GameMaster({ file: path.join(root, 'games.json') });
  gameMaster.startTruthOrDare('g@g.us', { by: 'u1@s.whatsapp.net' });
  const turn = gameMaster.nextTruthOrDare('g@g.us', 'u2@s.whatsapp.net', 'vérité');
  assert.equal(turn.handled, true);
  assert.equal(turn.type, 'vérité');
  assert.ok(turn.prompt.length > 5);
  assert.equal(gameMaster.get('g@g.us').history.length, 1);
});

test('safeSessionId neutralise les séparateurs de chemin', () => {
  assert.equal(safeSessionId('../../evil/session'), '.._.._evil_session');
});

test('sortie IA masque les secrets textuels usuels', () => {
  const out = sanitizeModelText('token=abcdef password:hello Bearer abc.def.ghi');
  assert.doesNotMatch(out, /abcdef|hello|abc\.def\.ghi/);
  assert.match(out, /\[REDACTED\]/);
});
