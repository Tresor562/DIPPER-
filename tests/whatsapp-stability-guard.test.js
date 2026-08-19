'use strict';

// Réduire les délais uniquement dans ce process de test avant le require.
process.env.WA_STABILITY_MIN_GAP_MS = '1';
process.env.WA_STABILITY_CHAT_GAP_MS = '1';
process.env.WA_STABILITY_MEDIA_GAP_MS = '3';
process.env.WA_STABILITY_GROUP_GAP_MS = '3';
process.env.WA_STABILITY_GROUP_CHUNK = '2';
process.env.WA_STABILITY_RESTORE_GAP_MS = '2';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  installSendGuard,
  getStats,
  isTransientSendError,
  isTerminalSessionError,
  reconnectDelay,
  markSocketClosed,
  chunkParticipants,
  waitRestoreSlot,
} = require('../utils/whatsappStabilityGuard');
const pairingGate = require('../utils/pairingGate');

test('stability guard protège sendMessage et relayMessage', async () => {
  const calls = [];
  const sock = {
    async sendMessage(jid, payload) { calls.push(['send', jid, payload.text]); return { key: { id: 's1' } }; },
    async relayMessage(jid) { calls.push(['relay', jid]); return { ok: true }; },
  };
  installSendGuard(sock, 'session_test');
  await sock.sendMessage('123@s.whatsapp.net', { text: 'hello' });
  await sock.relayMessage('123@s.whatsapp.net', { conversation: 'x' });
  assert.equal(calls.length, 2);
  const stats = getStats(sock);
  assert.equal(stats.sent, 1);
  assert.equal(stats.relayed, 1);
  assert.equal(stats.failed, 0);
});

test('réactions techniques restent directes et fermeture bloque les nouveaux envois', async () => {
  let count = 0;
  const sock = {
    async sendMessage() { count++; return { ok: true }; },
    async relayMessage() { return { ok: true }; },
  };
  installSendGuard(sock, 'session_fast');
  await sock.sendMessage('g@g.us', { react: { text: '✅', key: { id: '1' } } });
  assert.equal(count, 1);
  markSocketClosed(sock);
  await assert.rejects(() => sock.sendMessage('g@g.us', { text: 'after-close' }), /socket fermé/);
});

test('classifie erreurs transitoires et terminales sans les confondre', () => {
  assert.equal(isTransientSendError({ output: { statusCode: 503 } }), true);
  assert.equal(isTransientSendError(new Error('socket closed temporarily')), true);
  assert.equal(isTerminalSessionError({ output: { statusCode: 401 } }), true);
  assert.equal(isTerminalSessionError(new Error('connection replaced')), true);
  assert.equal(isTerminalSessionError({ output: { statusCode: 503 } }), false);
});

test('backoff de reconnexion augmente et reste plafonné', () => {
  const a = reconnectDelay(1, 0);
  const b = reconnectDelay(8, 503);
  assert.ok(a >= 2000 && a <= 5000);
  assert.ok(b > a);
  assert.ok(b <= 120000);
});

test('pairingGate sérialise le même numéro', async () => {
  const release1 = await pairingGate.acquire('+229 01 23 45 67 89');
  let acquired2 = false;
  const p2 = pairingGate.acquire('2290123456789').then(release => { acquired2 = true; release(); });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(acquired2, false);
  release1();
  await p2;
  assert.equal(acquired2, true);
  assert.equal(pairingGate.stats().active, 0);
});

test('actions de groupe en masse sont découpées et sérialisées', async () => {
  const batches = [];
  const requestBatches = [];
  const sock = {
    async sendMessage() { return { ok: true }; },
    async relayMessage() { return { ok: true }; },
    async groupParticipantsUpdate(group, participants, action) {
      batches.push({ group, participants: [...participants], action });
      return participants.map(jid => ({ jid, status: '200' }));
    },
    async groupRequestParticipantsUpdate(group, participants, action) {
      requestBatches.push({ group, participants: [...participants], action });
      return participants.map(jid => ({ jid, status: '200' }));
    },
  };
  installSendGuard(sock, 'session_groups');
  const users = ['1@s.whatsapp.net','2@s.whatsapp.net','3@s.whatsapp.net','4@s.whatsapp.net','5@s.whatsapp.net'];
  const result = await sock.groupParticipantsUpdate('g@g.us', users, 'remove');
  assert.equal(batches.length, 3);
  assert.deepEqual(batches.map(x => x.participants.length), [2,2,1]);
  assert.equal(result.length, 5);
  await sock.groupRequestParticipantsUpdate('g@g.us', users, 'approve');
  assert.equal(requestBatches.length, 3);
  const stats = getStats(sock);
  assert.equal(stats.groupActions, 10);
  assert.equal(stats.requestActions, 5);
  assert.equal(stats.groupFailed, 0);
});

test('helper de lots et restauration progressive restent bornés', async () => {
  assert.deepEqual(chunkParticipants([1,2,3,4,5], 2), [[1,2],[3,4],[5]]);
  await Promise.all([waitRestoreSlot(), waitRestoreSlot(), waitRestoreSlot()]);
});
