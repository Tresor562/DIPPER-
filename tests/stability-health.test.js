'use strict';

process.env.WA_STABILITY_MIN_GAP_MS = '1';
process.env.WA_STABILITY_CHAT_GAP_MS = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installSendGuard } = require('../utils/whatsappStabilityGuard');
const { buildAggregate } = require('../utils/stabilityHealth');

test('health agrège les sessions sans exposer numéros ni identifiants', async () => {
  const sock1 = { async sendMessage(){ return { ok:true }; }, async relayMessage(){ return { ok:true }; } };
  const sock2 = { async sendMessage(){ return { ok:true }; }, async relayMessage(){ return { ok:true }; } };
  installSendGuard(sock1, 'session_229000000001');
  installSendGuard(sock2, 'session_229000000002');
  await sock1.sendMessage('x@s.whatsapp.net', { text:'ok' });
  const health = buildAggregate([
    { sock:sock1, isOnline:true, isRegistered:true },
    { sock:sock2, isOnline:false, isRegistered:true },
  ], { active:1, maxConcurrent:3, lockedNumbers:1 });
  assert.equal(health.sessions.total, 2);
  assert.equal(health.sessions.online, 1);
  assert.equal(health.transport.sent, 1);
  assert.equal(health.pairing.active, 1);
  const serialized = JSON.stringify(health);
  assert.doesNotMatch(serialized, /22900000000/);
  assert.doesNotMatch(serialized, /session_/);
});
