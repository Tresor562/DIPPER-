'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractInteractiveId, decodeActionId, getInteractiveCommand } = require('../utils/nexaiInteractive');

test('decode NexAI quick-reply actions to normal commands', () => {
  assert.equal(decodeActionId('nexui:snake:up', '.'), '.snake up');
  assert.equal(decodeActionId('nexui:snake:fire', '!'), '!snake speed fire');
  assert.equal(decodeActionId('nexui:domino:play:6-4', '.'), '.domino play 6-4');
  assert.equal(decodeActionId('nexui:tiktok:audio:abc_123', '.'), '.tiktok action audio abc_123');
  assert.equal(decodeActionId('nexui:dashboard:menu', '.'), '.menu');
  assert.equal(decodeActionId('nexui:domino:play:9-4', '.'), null);
});

test('extract nativeFlowResponseMessage id from WhatsApp payload', () => {
  const payload={interactiveResponseMessage:{nativeFlowResponseMessage:{paramsJson:JSON.stringify({id:'nexui:snake:left'})}}};
  assert.equal(extractInteractiveId(payload), 'nexui:snake:left');
  assert.equal(getInteractiveCommand(payload, '.'), '.snake left');
});

test('extract interactive action through view-once wrapper', () => {
  const payload={viewOnceMessage:{message:{interactiveResponseMessage:{nativeFlowResponseMessage:{paramsJson:JSON.stringify({selected_id:'nexui:dashboard:domino'})}}}}};
  assert.equal(getInteractiveCommand(payload, '!'), '!domino new');
});

test('legacy unrelated button is not hijacked', () => {
  assert.equal(getInteractiveCommand({buttonsResponseMessage:{selectedButtonId:'btn_menu'}}, '.'), null);
});
