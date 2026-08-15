'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommandExecution, isCreatorQuestion, isBotIdentityQuestion, classifyIntent } = require('../ai_chat/cognition/intentOrchestrator');
const { answerCreatorQuestion, sanitizeCreatorAnswer } = require('../ai_chat/knowledge/creatorProfile');
const { ResearchEngine } = require('../ai_chat/research/researchEngine');
const { BotKnowledge } = require('../ai_chat/knowledge/botKnowledge');

test('explicit command execution wins over bot documentation', () => {
  assert.deepEqual(parseCommandExecution('Exaucée, exécute la commande ping'), { name: 'ping', args: [] });
  assert.equal(classifyIntent('Exécute la commande ping'), 'command_execute');
  const knowledge = new BotKnowledge({ getCommands: () => new Map() });
  assert.equal(knowledge.isBotQuestion('Exécute la commande ping'), false);
});

test('bot identity question is recognized directly', () => {
  assert.equal(isBotIdentityQuestion('Tu es branchée à quel bot ?'), true);
  assert.equal(classifyIntent('Tu es branchée à quel bot ?'), 'bot_identity');
});

test('creator identity is deterministic and surname stays undisclosed', () => {
  assert.equal(isCreatorQuestion('Qui est ton créateur ?'), true);
  const answer = answerCreatorQuestion('Qui est ton créateur ?');
  assert.match(answer, /Trésor/);
  assert.match(answer, /Tresor562/);
  const privacy = answerCreatorQuestion('Quel est le nom de famille de ton créateur ?');
  assert.match(privacy, /ne partage pas son nom de famille/i);
});

test('creator output sanitizer removes a second legal-looking name after Trésor', () => {
  assert.equal(sanitizeCreatorAnswer('Mon créateur est Trésor Example.'), 'Mon créateur est Trésor.');
});

test('factual who-is question triggers research', () => {
  const research = new ResearchEngine();
  assert.equal(research.needsResearch('Qui est Macron ?'), true);
  assert.equal(research.needsResearch('Comment vas-tu ?'), false);
});
