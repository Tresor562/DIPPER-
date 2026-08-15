'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CognitiveEngine, detectTone, detectIntent, resolveShortReference } = require('../ai_chat/cognition/cognitiveEngine');
const { MemoryStore } = require('../ai_chat/memory/store');
const { LocalModelRunner } = require('../ai_chat/ai/localModelRunner');

const persona = require('../ai_chat/personality/persona');

test('cognition detects tone, intent and language context', () => {
  assert.equal(detectTone('Je suis triste et fatigué aujourd’hui'), 'supportive');
  assert.equal(detectIntent('Vas-y continue'), 'continuation');
  assert.equal(detectIntent('Explique pourquoi ça marche'), 'question');
});

test('short replies are resolved from previous assistant turn', () => {
  const memory = { episodes: [
    { value: 'user: Tu me proposes deux solutions ?' },
    { value: 'assistant: La première est rapide. La deuxième est plus robuste.' }
  ] };
  const resolved = resolveShortReference('le deuxième', memory);
  assert.match(resolved, /deuxième/i);
  assert.match(resolved, /plus robuste/i);
});

test('cognitive prompt keeps long-term summary and recent turns', () => {
  const engine = new CognitiveEngine();
  const memory = {
    summary: 'U: Le projet concerne un bot WhatsApp.\nE: Nous travaillons sur Exaucée.',
    facts: [{ value: 'L’utilisateur préfère les réponses courtes.' }],
    preferences: { language: 'fr' },
    episodes: [
      { value: 'user: On reprend ?' },
      { value: 'assistant: Oui, on continue.' }
    ]
  };
  const analysis = engine.analyze('oui continue', memory, { isGroup: false, userId: 'u' });
  const messages = engine.buildMessages({ persona, memory, analysis, context: { isGroup: false, userId: 'u' } });
  assert.match(messages[0].content, /Résumé durable/);
  assert.match(messages[0].content, /réponses courtes/);
  assert.ok(messages.some(m => m.role === 'assistant' && /on continue/i.test(m.content)));
});

test('memory keeps a rolling long conversation summary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exa-memory-'));
  const store = new MemoryStore({ root });
  const ids = { sessionId: 's', chatId: 'c', userId: 'u' };
  for (let i = 0; i < 35; i++) store.updateSummary(ids, `question ${i}`, `réponse ${i}`);
  const state = store.getContext(ids);
  assert.equal(state.summaryTurns, 35);
  assert.match(state.summary, /question 34/);
  assert.ok(state.summary.length <= 9000);
});

test('native local model is optional and reports unavailable cleanly', () => {
  const runner = new LocalModelRunner({ EXAUCEE_LLAMA_CLI: '/missing/llama-cli', EXAUCEE_GGUF_MODEL: '/missing/model.gguf' });
  assert.equal(runner.available(), false);
});
