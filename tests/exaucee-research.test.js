'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ResearchEngine, safeUrl, relevance, extractUrl } = require('../ai_chat/research/researchEngine');

test('research intent detects explicit search and fresh information', () => {
  const r = new ResearchEngine();
  assert.equal(r.needsResearch('Exaucée, cherche les dernières nouvelles sur Node.js'), true);
  assert.equal(r.needsResearch("Quel est le prix actuel du bitcoin ?"), true);
  assert.equal(r.needsResearch('Raconte-moi une blague'), false);
});

test('direct URLs are detected and trigger research', () => {
  const r = new ResearchEngine();
  assert.equal(extractUrl('analyse https://example.com/page?utm_source=x'), 'https://example.com/page');
  assert.equal(r.needsResearch('lis https://example.com'), true);
});

test('private and local network URLs are refused', () => {
  assert.equal(safeUrl('http://127.0.0.1:3000/secret'), null);
  assert.equal(safeUrl('http://192.168.1.2/admin'), null);
  assert.equal(safeUrl('http://10.0.0.5/'), null);
  assert.equal(safeUrl('https://example.com/info'), 'https://example.com/info');
});

test('relevance rewards matching query terms', () => {
  const strong = relevance('node javascript runtime', { title: 'Node JavaScript runtime', snippet: 'server runtime' });
  const weak = relevance('node javascript runtime', { title: 'Recette de cuisine', snippet: 'gâteau chocolat' });
  assert.ok(strong > weak);
});

test('source footer and offline fallback are usable', () => {
  const r = new ResearchEngine();
  const report = { results: [
    { title: 'Source A', url: 'https://example.com/a', snippet: 'Un fait utile.' },
    { title: 'Source B', url: 'https://example.com/b', snippet: 'Un second fait.' }
  ] };
  assert.match(r.sourceFooter(report), /Source A/);
  assert.match(r.sourceFooter(report), /https:\/\/example\.com\/b/);
  assert.match(r.fallbackSummary(report), /fait utile/i);
});
