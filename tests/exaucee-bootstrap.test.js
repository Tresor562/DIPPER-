'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sessionContext = require('../utils/sessionContext');
const {
  bootstrapExaucee,
  getInstance,
  handleExauceeDynamicCommand
} = require('../ai_chat/runtime');

function cleanupSession(sessionId) {
  try {
    fs.rmSync(path.join(process.cwd(), 'data', 'exaucee', 'sessions', sessionId), {
      recursive: true,
      force: true
    });
  } catch (_) {}
}

test('bootstrap Exaucée exécute immédiatement un rappel persistant déjà dû', async () => {
  const sessionId = `bootstrap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  cleanupSession(sessionId);
  const exaucee = getInstance(sessionId);
  exaucee.config.enabled = true;
  exaucee.scheduler.schedule({
    id: 'due-reminder',
    runAt: Date.now() - 10,
    action: { type: 'send_message', chatId: '22900000000@s.whatsapp.net', text: 'rappel reboot' }
  });

  let sent = null;
  let resolveSent;
  const sentPromise = new Promise(resolve => { resolveSent = resolve; });
  const sock = {
    async sendMessage(jid, payload) {
      sent = { jid, payload };
      resolveSent();
      return { key: { id: 'bootstrap-sent-1' } };
    }
  };

  assert.equal(bootstrapExaucee({ sock, sessionId }), true);
  await Promise.race([
    sentPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('scheduler bootstrap timeout')), 1000))
  ]);

  assert.equal(sent.jid, '22900000000@s.whatsapp.net');
  assert.equal(sent.payload.text, '🌸 rappel reboot');
  assert.equal(exaucee.scheduler.list()[0].status, 'done');

  exaucee.scheduler.stop();
  cleanupSession(sessionId);
});

test('le compte connecté peut invoquer une commande dynamique explicite', async () => {
  const sessionId = `dynamic_owner_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  cleanupSession(sessionId);
  const exaucee = getInstance(sessionId);
  exaucee.config.enabled = true;
  exaucee.dynamicCommands.define(sessionId, {
    name: 'hello',
    groupId: '123@g.us',
    workflow: { type: 'reply', text: 'Commande owner OK 🌸' }
  });

  const calls = [];
  const sock = {
    async sendMessage(...args) {
      calls.push(args);
      return { key: { id: 'owner-dynamic-1' } };
    }
  };
  const msg = {
    key: { id: 'owner-msg-1', remoteJid: '123@g.us', fromMe: true },
    message: { conversation: '.hello' }
  };

  const handled = await sessionContext.run(sessionId, () =>
    handleExauceeDynamicCommand({ sock, msg, commandName: 'hello' })
  );

  assert.equal(handled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].text, 'Commande owner OK 🌸\n\n> Exaucée');
  assert.equal(calls[0][1].__exaucee, true);

  exaucee.scheduler.stop();
  cleanupSession(sessionId);
});
