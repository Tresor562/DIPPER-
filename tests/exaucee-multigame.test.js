'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AdvancedGameMaster } = require('../ai_chat/games/advancedGameMaster');
const { executeWorkflow, parseWorkflowIntent, render } = require('../ai_chat/dynamic/workflowEngine');

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exaucee-games-'));
  return path.join(dir, 'games.json');
}

test('two quizzes can coexist in the same group and be targeted independently', () => {
  const gm = new AdvancedGameMaster({ file: tempFile() });
  const a = gm.startQuiz('group@g.us', { category: 'anime', rounds: 2 });
  const b = gm.startQuiz('group@g.us', { category: 'general', rounds: 2 });
  assert.notEqual(a.game.id, b.game.id);
  assert.equal(gm.list('group@g.us', { activeOnly: true, type: 'quiz' }).length, 2);
  const answerA = a.game.questions[0].a[0];
  const result = gm.answerQuiz('group@g.us', 'u@s.whatsapp.net', `#${a.game.alias} ${answerA}`);
  assert.equal(result.handled, true);
  assert.equal(result.correct, true);
  const untouched = gm.resolve('group@g.us', b.game.alias, 'quiz');
  assert.equal(untouched.questionIndex, 0);
});

test('games are isolated between groups and survive reload', () => {
  const file = tempFile();
  const gm = new AdvancedGameMaster({ file });
  const q = gm.startQuiz('a@g.us', { rounds: 2 });
  const h = gm.startHangman('b@g.us');
  assert.equal(gm.activeCount('a@g.us'), 1);
  assert.equal(gm.activeCount('b@g.us'), 1);
  assert.equal(gm.resolve('a@g.us', q.game.alias).type, 'quiz');
  assert.equal(gm.resolve('b@g.us', h.game.alias).type, 'hangman');
  const restored = new AdvancedGameMaster({ file });
  assert.equal(restored.resolve('a@g.us', q.game.alias).id, q.game.id);
  assert.equal(restored.resolve('b@g.us', h.game.alias).id, h.game.id);
});

test('mystery and hangman are independent game engines', () => {
  const gm = new AdvancedGameMaster({ file: tempFile() });
  const mystery = gm.startMystery('g@g.us');
  const hangman = gm.startHangman('g@g.us');
  assert.equal(gm.activeCount('g@g.us'), 2);
  const mysteryResult = gm.guessMystery('g@g.us', 'u@s.whatsapp.net', `#${mystery.game.alias} ${mystery.game.answer}`);
  assert.equal(mysteryResult.correct, true);
  assert.equal(gm.resolve('g@g.us', hangman.game.alias, 'hangman').status, 'playing');
});

test('dynamic workflow templates expose only bounded declared variables', () => {
  assert.equal(render('Salut {user}, {arg1}', { userName: 'Nexus', args: ['yo'] }), 'Salut Nexus, yo');
  assert.equal(render('{unknown}', {}), '{unknown}');
});

test('random and sequence workflow intents are parsed without arbitrary code', () => {
  const random = parseWorkflowIntent('crée commande humeur qui répond aléatoirement Bien | Super | Calme');
  assert.equal(random.workflow.type, 'random_reply');
  const sequence = parseWorkflowIntent('crée commande intro qui envoie Salut | Bienvenue');
  assert.equal(sequence.workflow.type, 'sequence');
});

test('workflow engine executes a bounded sequence', async () => {
  const sent = [];
  const result = await executeWorkflow({ type: 'sequence', steps: [
    { type: 'reply', text: 'Bonjour {user}' },
    { type: 'wait', ms: 1 },
    { type: 'reply', text: 'Arg: {arg1}' }
  ] }, { userName: 'Trésor', args: ['test'], send: async text => sent.push(text) });
  assert.equal(result.handled, true);
  assert.deepEqual(sent, ['Bonjour Trésor', 'Arg: test']);
});
