'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('channel auto-follow waits 2h30 and does not follow immediately', async () => {
  const { ensureChannelFollow, FOLLOW_DELAY_MS } = require('../utils/channelAutoFollow');

  assert.equal(FOLLOW_DELAY_MS, 150 * 60 * 1000);

  let calls = 0;
  const sock = {
    newsletterFollow: async () => { calls += 1; },
  };

  const result = await ensureChannelFollow(sock, 'test-session');

  assert.equal(result.ok, true);
  assert.equal(result.scheduled, true);
  assert.equal(result.delayMs, 150 * 60 * 1000);
  assert.equal(calls, 0);
  assert.ok(sock._dipperNewsletterFollowTimer);

  clearTimeout(sock._dipperNewsletterFollowTimer);
  sock._dipperNewsletterFollowTimer = null;
});
