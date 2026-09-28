'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  claimMessageExecution,
  buildMessageExecutionKey,
  _resetForTests,
} = require('../utils/messageExecutionGuard');

function sock(phone, userId = null) {
  return {
    _sessionPhoneNumber: phone,
    user: { id: userId || `${phone}:7@s.whatsapp.net` },
  };
}

function msg(id, remoteJid = '22990000000@s.whatsapp.net') {
  return {
    key: { id, remoteJid, fromMe: false },
    message: { conversation: '.ping' },
  };
}

test.beforeEach(() => _resetForTests());

test('same message is claimed only once on the same socket', () => {
  const s = sock('22911111111');
  const m = msg('ABC123');
  assert.equal(claimMessageExecution(s, m, 1_000), true);
  assert.equal(claimMessageExecution(s, m, 1_001), false);
});

test('same account across two sockets shares the same execution claim', () => {
  const legacy = sock('22911111111', '22911111111:1@s.whatsapp.net');
  const managed = sock('22911111111', '22911111111:9@s.whatsapp.net');
  const m = msg('DUAL-SOCKET');

  assert.equal(claimMessageExecution(legacy, m, 2_000), true);
  assert.equal(claimMessageExecution(managed, m, 2_001), false);
});

test('different WhatsApp accounts do not block each other', () => {
  const m = msg('SAME-ID');
  assert.equal(claimMessageExecution(sock('22911111111'), m, 3_000), true);
  assert.equal(claimMessageExecution(sock('22922222222'), m, 3_001), true);
});

test('same message id in different chats remains independent', () => {
  const s = sock('22911111111');
  assert.equal(claimMessageExecution(s, msg('SAME-ID', 'chat-a@g.us'), 4_000), true);
  assert.equal(claimMessageExecution(s, msg('SAME-ID', 'chat-b@g.us'), 4_001), true);
});

test('synthetic fuzzy-confirmation message remains executable through its new id', () => {
  const s = sock('22911111111');
  assert.equal(claimMessageExecution(s, msg('ORIGINAL'), 5_000), true);
  assert.equal(claimMessageExecution(s, msg('ORIGINAL_fzc'), 5_001), true);
});

test('messages without a WhatsApp id fail open', () => {
  const s = sock('22911111111');
  const m = { key: { remoteJid: '22990000000@s.whatsapp.net' }, message: { conversation: '.ping' } };
  assert.equal(buildMessageExecutionKey(s, m), null);
  assert.equal(claimMessageExecution(s, m, 6_000), true);
  assert.equal(claimMessageExecution(s, m, 6_001), true);
});
