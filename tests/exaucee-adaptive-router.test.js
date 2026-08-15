'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inferMode, MODE, ZeroCostRouter } = require('../ai_chat/ai/zeroCostRouter');
const { createGuaranteedBrain } = require('../ai_chat/core');
const { detectReasoningMode, ambiguitySignals } = require('../ai_chat/cognition/cognitiveEngine');

test('adaptive mode selects fast, deep, agent and dual', () => {
  assert.equal(inferMode([{role:'user',content:'Coucou'}]), MODE.FAST);
  assert.equal(inferMode([{role:'user',content:'Analyse ce problème en profondeur'}]), MODE.DEEP);
  assert.equal(inferMode([{role:'user',content:'Exécute la commande ping'}]), MODE.AGENT);
  assert.equal(inferMode([{role:'user',content:'Compare deux hypothèses et recoupe les résultats'}]), MODE.DUAL);
});

test('cognition exposes compatible reasoning modes', () => {
  assert.equal(detectReasoningMode('Salut', 'conversation'), 'fast');
  assert.equal(detectReasoningMode('Organise un tournoi demain', 'action'), 'agent');
  assert.equal(detectReasoningMode('Fais une analyse approfondie', 'question'), 'deep');
  assert.equal(ambiguitySignals('fais ça').likelyAmbiguous, true);
});

test('guaranteed brain does not let rule brain preempt a real model', async () => {
  const primary = {
    localBrain: {
      answer(){ return {text:'mauvaise réponse locale',confidence:1}; },
      fallback(){ return {provider:'local',text:'fallback'}; }
    },
    async complete(){ return {provider:'frontier-free',text:'bonne réponse contextuelle'}; },
    providerStatus(){ return {providers:{}}; }
  };
  const brain = createGuaranteedBrain(primary);
  const out = await brain.complete({messages:[{role:'user',content:'Qui est Macron ?'}]});
  assert.equal(out.text, 'bonne réponse contextuelle');
  assert.equal(out.provider, 'frontier-free');
});

test('provider diagnostics never expose API keys', () => {
  const router = new ZeroCostRouter({groqKey:'secret-groq',geminiKey:'secret-gemini',openRouterKey:'secret-or'});
  const status = router.providerStatus();
  const raw = JSON.stringify(status);
  assert.equal(raw.includes('secret-groq'), false);
  assert.equal(raw.includes('secret-gemini'), false);
  assert.equal(raw.includes('secret-or'), false);
  assert.equal(status.providers.groq.configured, true);
  assert.equal(status.providers.gemini.configured, true);
  assert.equal(status.providers.openrouter.configured, true);
  assert.equal(status.policy.maxCostPerRequest, 0);
});
