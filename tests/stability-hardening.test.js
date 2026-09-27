'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('stability hardening remains enabled', () => {
  const index = read('index.js');
  const session = read('utils/sessionManager.js');
  const pairing = read('utils/pairingService.js');
  const handler = read('handler.js');
  const follow = read('utils/channelAutoFollow.js');
  const mainReact = read('utils/channelAutoReact.js');
  const secondaryReact = read('utils/channelSecondaryReact.js');
  const installer = read('scripts/install-channel-react.js');
  const kickall = read('commands/group_guardians/kickall.js');
  const approveall = read('commands/group_management/approveall.js');
  const purification = read('commands/group_guardians/purification.js');
  const antiraid = read('commands/group_management/antiraid.js');

  // Forced presence is no longer emitted every 30 seconds.
  assert.match(index, /FORCED_PRESENCE_INTERVAL_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
  assert.match(session, /FORCED_PRESENCE_INTERVAL_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
  assert.doesNotMatch(index, /heartbeatTimer[\s\S]{0,300},\s*30\s*\*\s*1000/);
  assert.doesNotMatch(session, /timers\.heartbeat[\s\S]{0,300},\s*30000/);

  // Dedup survives reconnects and keys include chat/session context.
  assert.doesNotMatch(index, /processedMessages\.clear\(\)/);
  assert.doesNotMatch(session, /processedMessages\.clear\(\)/);
  assert.match(index, /function messageDedupKey/);
  assert.match(session, /function messageDedupKey/);

  // Safe re-pairing never replaces a live reconnect or in-flight pairing.
  assert.match(pairing, /PAIRING_IN_PROGRESS/);
  assert.match(pairing, /RECONNECT_PENDING/);
  assert.match(pairing, /SESSION_REPLACED/);
  assert.match(pairing, /RECONNECT_GRACE_MS\s*=\s*45\s*\*\s*1000/);
  assert.match(session, /function getLastDisconnect/);
  assert.match(session, /category:\s*disconnectCategory/);

  // No unsolicited private automation.
  assert.match(handler, /UNSOLICITED_PRIVATE_BLOCKED/);
  assert.match(handler, /PRIVATE_INITIATION_TTL_MS/);
  assert.match(index, /initializeSendPolicy\(sock\)/);
  assert.match(session, /initializeSendPolicy\(sock\)/);

  // Auto-follow and newsletter subscriptions are deferred.
  assert.match(follow, /FOLLOW_DELAY_MS\s*=\s*150\s*\*\s*60\s*\*\s*1000/);
  assert.match(mainReact, /60\s*\*\s*60_000,\s*6\s*\*\s*60\s*\*\s*60_000,\s*12\s*\*\s*60\s*\*\s*60_000/);
  assert.match(secondaryReact, /60\s*\*\s*60_000,\s*6\s*\*\s*60\s*\*\s*60_000,\s*12\s*\*\s*60\s*\*\s*60_000/);
  assert.match(installer, /20\s*\*\s*60\s*\*\s*1000/);
  assert.match(installer, /25\s*\*\s*60\s*\*\s*1000/);

  // Administrative bulk actions are serialized with fixed pauses.
  assert.match(kickall, /ACTION_PAUSE_MS\s*=\s*3000/);
  assert.match(approveall, /APPROVE_PAUSE_MS\s*=\s*3000/);
  assert.match(purification, /ENFORCEMENT_PAUSE_MS\s*=\s*3000/);
  assert.match(antiraid, /setTimeout\(r,\s*3000\)/);

  // Removed commands stay removed.
  for (const rel of [
    'commands/bot_sovereignty/anticall.js',
    'commands/bot_sovereignty/darkmood.js',
    'commands/bot_sovereignty/repere.js',
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), false, rel + ' must stay deleted');
  }
});
