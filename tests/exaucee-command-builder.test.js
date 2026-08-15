'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { compileCommandIntent, validateWorkflow } = require('../ai_chat/dynamic/commandBuilder');
const { DynamicCommandRegistry } = require('../ai_chat/dynamic/registry');


test('builder understands natural fixed reply commands', () => {
  const built = compileCommandIntent('Exaucée, crée une commande bienvenue qui répond Salut {user}');
  assert.equal(built.ok, true);
  assert.equal(built.spec.name, 'bienvenue');
  assert.equal(built.spec.workflow.type, 'reply');
});

test('builder understands random replies', () => {
  const built = compileCommandIntent('crée commande humeur qui répond au hasard super | bien | fatiguée');
  assert.equal(built.ok, true);
  assert.equal(built.spec.workflow.type, 'random_reply');
  assert.equal(built.spec.workflow.choices.length, 3);
});

test('builder rejects native command collisions and reserved names', () => {
  const native = new Map([['menu', { name: 'menu' }]]);
  assert.equal(compileCommandIntent('crée commande menu qui répond test', { staticCommands: native }).ok, false);
  assert.equal(compileCommandIntent('crée commande exec qui répond test').ok, false);
});

test('workflow validator rejects oversized or malformed workflows', () => {
  assert.equal(validateWorkflow({ type: 'random_reply', choices: ['solo'] }).ok, false);
  assert.equal(validateWorkflow({ type: 'sequence', steps: Array.from({ length: 13 }, () => ({ type: 'reply', text: 'x' })) }).ok, false);
  assert.equal(validateWorkflow({ type: 'sequence', steps: [{ type: 'wait', ms: 50000 }] }).ok, false);
});

test('registry preserves previous versions and can rollback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exa-cmd-'));
  const registry = new DynamicCommandRegistry({ file: path.join(dir, 'commands.json') });
  const one = registry.define('s1', { name: 'hello', workflow: { type: 'reply', text: 'un' } });
  const two = registry.define('s1', { name: 'hello', workflow: { type: 'reply', text: 'deux' } });
  assert.equal(one.version, 1);
  assert.equal(two.version, 2);
  const rolled = registry.rollback('s1', 'hello');
  assert.equal(rolled.workflow.text, 'un');
});
