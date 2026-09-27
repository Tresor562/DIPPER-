'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('stability hardening stays enabled', () => {
  const index = read('index.js');
  const sessions = read('utils/sessionManager.js');
  const pairing = read('utils/pairingService.js');
  const mainReact = read('utils/channelAutoReact.js');
  const secondaryReact = read('utils/channelSecondaryReact.js');
  const follow = read('utils/channelAutoFollow.js');
  const kickall = read('commands/group_guardians/kickall.js');
  const approveall = read('commands/group_management/approveall.js');
  const purification = read('commands/group_guardians/purification.js');
  const antiraid = read('commands/group_management/antiraid.js');

  assert.match(follow, /150 \* 60 \* 1000/);
  assert.match(index, /FORCED_PRESENCE_INTERVAL_MS = 15 \* 60 \* 1000/);
  assert.match(sessions, /FORCED_PRESENCE_INTERVAL_MS = 15 \* 60 \* 1000/);

  assert.match(mainReact, /60 \* 60_000, 6 \* 60 \* 60_000, 12 \* 60 \* 60_000/);
  assert.match(secondaryReact, /60 \* 60_000, 6 \* 60 \* 60_000, 12 \* 60 \* 60_000/);

  assert.match(index, /SELF_ONLINE_NOTICE_DELAY_MS = 2 \* 60 \* 1000/);
  assert.match(index, /OWNER_SYNC_NOTICE_DELAY_MS = 8 \* 60 \* 1000/);
  assert.match(index, /AUTO_BIO_DELAY_MS = 15 \* 60 \* 1000/);
  assert.match(sessions, /SESSION_WELCOME_DELAY_MS = 4 \* 60 \* 1000/);

  assert.doesNotMatch(index, /processedMessages\.clear\(\)/);
  assert.doesNotMatch(sessions, /processedMessages\.clear\(\)/);
  assert.match(index, /messageDedupKey\(msg\)/);
  assert.match(sessions, /messageDedupKey\(msg\)/);

  assert.match(pairing, /RECONNECT_GRACE_MS = 45 \* 1000/);
  assert.match(pairing, /RECONNECT_PENDING/);
  assert.match(pairing, /SESSION_REPLACED/);

  assert.match(kickall, /ACTION_PAUSE_MS = 3000/);
  assert.match(approveall, /APPROVE_PAUSE_MS = 3000/);
  assert.match(purification, /ENFORCEMENT_PAUSE_MS = 3000/);
  assert.match(antiraid, /setTimeout\(r, 3000\)/);

  assert.equal(fs.existsSync(path.join(ROOT, 'commands/bot_sovereignty/anticall.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'commands/bot_sovereignty/darkmood.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'commands/bot_sovereignty/repere.js')), false);

  assert.doesNotMatch(index, /initializeAntiCall|startDarkmoodScheduler/);
  assert.doesNotMatch(sessions, /initializeAntiCall|startDarkmoodScheduler/);
});
