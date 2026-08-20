'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createExaucee } = require('../ai_chat/core');
const { executeDynamic } = require('../ai_chat/runtime');

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'exaucee-dynamic-'));
}

function message(chat = '123@g.us') {
  return {
    key: { id: 'dyn-msg-1', remoteJid: chat, fromMe: false },
    message: { conversation: '.hello' }
  };
}

test('une commande dynamique préfixée est réellement exécutable en groupe', async () => {
  const exaucee = createExaucee({
    sessionId: 'dynamic-test',
    root: makeTmp(),
    config: { enabled: true }
  });
  exaucee.dynamicCommands.define('dynamic-test', {
    name: 'hello',
    groupId: '123@g.us',
    workflow: { type: 'reply', text: 'Salut depuis Exaucée 🌸' }
  });

  const calls = [];
  const sock = {
    async sendMessage(...args) {
      calls.push(args);
      return { key: { id: 'sent-dyn-1' } };
    }
  };

  const handled = await executeDynamic(
    exaucee,
    'dynamic-test',
    '.hello',
    '123@g.us',
    sock,
    message()
  );

  assert.equal(handled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '123@g.us');
  assert.equal(calls[0][1].text, 'Salut depuis Exaucée 🌸\n\n> Exaucée');
  assert.equal(calls[0][1].__exaucee, true);
});

test('une commande dynamique liée à un groupe ne fuit pas vers un autre groupe', async () => {
  const exaucee = createExaucee({
    sessionId: 'dynamic-scope-test',
    root: makeTmp(),
    config: { enabled: true }
  });
  exaucee.dynamicCommands.define('dynamic-scope-test', {
    name: 'hello',
    groupId: '123@g.us',
    workflow: { type: 'reply', text: 'secret de groupe' }
  });

  let sent = false;
  const sock = { async sendMessage() { sent = true; } };
  const handled = await executeDynamic(
    exaucee,
    'dynamic-scope-test',
    '.hello',
    '999@g.us',
    sock,
    message('999@g.us')
  );

  assert.equal(handled, false);
  assert.equal(sent, false);
});
