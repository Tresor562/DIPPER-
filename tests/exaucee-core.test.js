'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { routeMessage } = require('../ai_chat/router/socialRouter');
const { assertPermission, redact } = require('../ai_chat/security/policy');
const { GameRegistry, quizEngine } = require('../ai_chat/games/registry');
const { CommandBridge } = require('../ai_chat/tools/commandBridge');

function msg({ text = '', chat = '1@g.us', fromMe = false, quotedId = null } = {}) {
  return {
    key: { id: 'm1', remoteJid: chat, fromMe },
    message: {
      extendedTextMessage: {
        text,
        contextInfo: quotedId ? { stanzaId: quotedId } : {}
      }
    }
  };
}

test('group conversation humaine reste silencieuse', () => {
  const d = routeMessage({ msg: msg({ text: 'Yannick tu as fini ?' }) });
  assert.equal(d.shouldRespond, false);
});

test('mention nominale Exaucée déclenche une réponse', () => {
  const d = routeMessage({ msg: msg({ text: 'Exaucée tu es là ?' }) });
  assert.equal(d.shouldRespond, true);
});

test('réponse à un message Exaucée déclenche une réponse', () => {
  const d = routeMessage({ msg: msg({ text: 'oui', quotedId: 'exa1' }), recentExauceeMessageIds: new Set(['exa1']) });
  assert.equal(d.shouldRespond, true);
});

test('compte humain connecté garde la priorité', () => {
  const d = routeMessage({ msg: msg({ text: 'salut', chat: '229@s.whatsapp.net', fromMe: true }) });
  assert.equal(d.shouldRespond, false);
});

test('permission owner refusée à user', () => {
  assert.throws(() => assertPermission({ actor: {}, tool: { name: 'x', allowedRoles: ['owner'] } }), /Permission refusée/);
});

test('redaction supprime les secrets', () => {
  assert.equal(redact({ apiKey: 'abc', ok: 1 }).apiKey, '[REDACTED]');
});

test('GameRegistry crée un quiz depuis un template', () => {
  const games = new GameRegistry();
  games.registerEngine(quizEngine);
  games.registerTemplate({ id: 'anime', engine: 'quiz', rules: { rounds: 20 } });
  const session = games.create('anime', { gameId: 'g1' });
  assert.equal(session.rules.rounds, 20);
  assert.equal(session.status, 'lobby');
});

test('CommandBridge propage les permissions existantes sans les contourner', async () => {
  let receivedExtra = null;
  const commands = new Map([['sample', {
    name: 'sample',
    adminOnly: true,
    async execute(_sock, _msg, _args, extra) { receivedExtra = extra; return 'ok'; }
  }]]);
  const bridge = new CommandBridge({ commands });
  const result = await bridge.execute('sample', {
    msg: msg(),
    actor: { isOwner: true },
    extra: { marker: 1 }
  });
  assert.equal(result, 'ok');
  assert.equal(receivedExtra.marker, 1);
  assert.equal(receivedExtra.isOwner, true);
  assert.equal(receivedExtra.isAdmin, true);
});
