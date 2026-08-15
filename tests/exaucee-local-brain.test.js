'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LocalBrain } = require('../ai_chat/ai/localBrain');
const { naturalControl, signedByAnotherExaucee } = require('../ai_chat/runtimeControl');

test('local brain answers identity without network', () => {
  const brain = new LocalBrain();
  const answer = brain.answer([{ role: 'user', content: 'Exaucée, présente-toi' }]);
  assert.ok(answer);
  assert.match(answer.text, /Exaucée/i);
  assert.ok(answer.confidence >= 0.9);
});

test('local brain always has a fallback', () => {
  const brain = new LocalBrain();
  const answer = brain.fallback([{ role: 'user', content: 'question totalement inconnue ?' }]);
  assert.equal(answer.provider, 'exaucee-local-brain');
  assert.ok(answer.text.length > 20);
});

test('natural owner controls are recognized with or without dot', () => {
  assert.equal(naturalControl('Exaucée off'), 'off');
  assert.equal(naturalControl('.exaucee on'), 'on');
  assert.equal(naturalControl('Exaucée status'), 'status');
});

test('messages signed by another Exaucee are ignored', () => {
  const msg = { message: { conversation: 'Bonjour 🌸\n\n> Exaucée' } };
  assert.equal(signedByAnotherExaucee(msg), true);
  const human = { message: { conversation: 'Exaucée, bonjour' } };
  assert.equal(signedByAnotherExaucee(human), false);
});
