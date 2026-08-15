'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compileCommandIntent } = require('../ai_chat/dynamic/commandBuilder');

test('builder refuses names that normalize to invalid identifiers', () => {
  const built = compileCommandIntent('crée commande 123 qui répond test');
  assert.equal(built.ok, false);
});
