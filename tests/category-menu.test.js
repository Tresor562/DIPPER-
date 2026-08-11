'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalize,
  extractRequestedCategory,
  resolveCategory,
  commandsForCategory,
} = require('../utils/categoryMenu');

test('normalisation catégorie robuste accents/casse/espaces', () => {
  assert.equal(normalize('  TÉLÉCHARGEMENTS  '), 'telechargements');
  assert.equal(normalize('Gestion   de Groupe'), 'gestion de groupe');
});

test('extraction Catégorie Menu avec et sans préfixe', () => {
  assert.equal(extractRequestedCategory('Groupe Menu', '.'), 'Groupe');
  assert.equal(extractRequestedCategory('.Download Menu', '.'), 'Download');
  assert.equal(extractRequestedCategory('  Téléchargements   menu  ', '.'), 'Téléchargements');
  assert.equal(extractRequestedCategory('menu', '.'), null);
  assert.equal(extractRequestedCategory('Groupe', '.'), null);
});

test('Groupe Menu résout la catégorie canonique et ses commandes', () => {
  const category = resolveCategory('Groupe');
  assert.equal(category, '⚙️ Gestion de groupe');
  const commands = commandsForCategory(category);
  assert.ok(commands.length > 0);
  assert.ok(commands.every(cmd => cmd.category === category));
});

test('Download Menu résout la catégorie canonique et ses commandes', () => {
  const category = resolveCategory('Download');
  assert.equal(category, '📥 Téléchargements');
  const commands = commandsForCategory(category);
  assert.ok(commands.length > 0);
  assert.ok(commands.every(cmd => cmd.category === category));
});

test('les noms réels et alias courants résolvent les mêmes catégories', () => {
  assert.equal(resolveCategory('Téléchargements'), '📥 Téléchargements');
  assert.equal(resolveCategory('gestion de groupe'), '⚙️ Gestion de groupe');
  assert.equal(resolveCategory('tools'), '🛠️ Outils généraux');
  assert.equal(resolveCategory('search'), '🔍 Recherche');
});
