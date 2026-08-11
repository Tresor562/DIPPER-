'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROFILES,
  renderResponse,
  sanitizeLegacyText,
  decoratePayload,
  getLegacyPhrases,
} = require('../utils/responseStyle');

const FORBIDDEN = /[╭╮╰╯┃║╔╗╚╝╠╣╦╩╬┌┐└┘│≪≫╼╾]/u;
const legacy = `╭━≪• 🔑 CODE DE CONNEXION •≫━╾╮\n┃\n┃  1234-5678\n┃\n╰━━━━━━━━━━━━━━━━━━━╯`;

for (let style = 0; style <= 20; style++) {
  test(`style ${style} nettoie les cadres lourds`, () => {
    assert.ok(PROFILES[style], `profil ${style} absent`);
    const result = sanitizeLegacyText(legacy, style);
    assert.equal(FORBIDDEN.test(result), false, result);
    assert.match(result, /1234-5678/);
    assert.match(result, /CODE DE CONNEXION/);
  });

  test(`style ${style} rend les 8 types de réponse sans cadre`, () => {
    for (const type of ['info', 'wait', 'success', 'warning', 'error', 'denied', 'usage', 'list']) {
      const result = renderResponse({ style, type, title: 'TEST', body: 'Contenu utile.' });
      assert.equal(FORBIDDEN.test(result), false, `${type}: ${result}`);
      assert.match(result, /Contenu utile/);
      assert.match(result, /TEST/);
    }
  });

  test(`style ${style} garde les phrases legacy disciplinées`, () => {
    const phrases = getLegacyPhrases(style);
    for (const key of ['footer', 'error', 'wait', 'success', 'denied', 'groupOnly', 'adminOnly', 'botAdmin']) {
      const value = phrases[key]();
      assert.equal(typeof value, 'string');
      assert.equal(FORBIDDEN.test(value), false, `${key}: ${value}`);
      assert.ok(value.trim().length > 0, key);
    }
  });
}

test('decoratePayload préserve les payloads non textuels', () => {
  const reaction = { react: { text: '✅', key: { id: 'x' } } };
  assert.strictEqual(decoratePayload(reaction, 0), reaction);
});

test('decoratePayload nettoie text et caption sans toucher au reste', () => {
  const payload = { text: legacy, mentions: ['1@s.whatsapp.net'] };
  const result = decoratePayload(payload, 0);
  assert.equal(FORBIDDEN.test(result.text), false);
  assert.deepEqual(result.mentions, payload.mentions);
});
