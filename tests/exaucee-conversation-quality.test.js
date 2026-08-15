'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLowQualityResponse, similarity } = require('../ai_chat/ai/responseQuality');

test('rejette une réponse générique répétée', () => {
  const recent = [
    'D’accord. Continue, je suis le fil. Si tu veux que j’agisse dessus, dis-moi simplement ce que tu veux obtenir.'
  ];
  const candidate = 'D’accord. Continue, je suis le fil. Si tu veux que j’agisse dessus, dis-moi simplement ce que tu veux obtenir.';
  assert.equal(isLowQualityResponse({ candidate, userText: 'Qui est Macron ?', recentAssistant: recent }), true);
});

test('accepte une réponse liée à la question', () => {
  assert.equal(isLowQualityResponse({ candidate: 'Emmanuel Macron est un homme politique français. Si tu veux, je peux vérifier sa fonction actuelle et te donner des sources récentes.', userText: 'Qui est Macron ?', recentAssistant: [] }), false);
});

test('la similarité détecte les boucles', () => {
  assert.ok(similarity('je suis le fil continue', 'je suis le fil continue') > 0.95);
});
