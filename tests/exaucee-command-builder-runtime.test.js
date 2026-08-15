'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeWorkflow, render } = require('../ai_chat/dynamic/workflowEngine');


test('workflow variables render predictably', () => {
  assert.equal(render('Salut {user}, arg={arg1}', { userName: 'Nexus', args: ['ok'] }), 'Salut Nexus, arg=ok');
});

test('unknown workflow is never executed', async () => {
  let calls = 0;
  const result = await executeWorkflow({ type: 'javascript', code: 'boom()' }, { send: async () => { calls++; } });
  assert.equal(result.handled, false);
  assert.equal(calls, 0);
});

test('sequence execution is bounded to twelve steps', async () => {
  let calls = 0;
  const steps = Array.from({ length: 30 }, (_, i) => ({ type: 'reply', text: String(i) }));
  const result = await executeWorkflow({ type: 'sequence', steps }, { send: async () => { calls++; } });
  assert.equal(result.handled, true);
  assert.equal(calls, 12);
});
