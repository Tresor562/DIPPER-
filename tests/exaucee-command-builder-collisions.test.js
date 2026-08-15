'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compileCommandIntent, normalizeName } = require('../ai_chat/dynamic/commandBuilder');

test('command names are normalized safely', () => {
  assert.equal(normalizeName('.Bienvenue!!'), 'bienvenue');
});

test('native aliases also block dynamic command creation', () => {
  const built = compileCommandIntent('crée commande p qui répond pong', { aliases: new Set(['p']) });
  assert.equal(built.ok, false);
  assert.equal(built.code, 'COLLISION');
});
