'use strict';

const fs = require('fs');
const path = require('path');

const QUIZ_BANKS = Object.freeze({
  anime: [
    { q: 'Dans Naruto, quel est le nom du village de Naruto ?', a: ['konoha', 'village caché de la feuille', 'village cache de la feuille'] },
    { q: 'Dans One Piece, comment s’appelle le capitaine des Mugiwara ?', a: ['luffy', 'monkey d luffy', 'monkey d. luffy'] },
    { q: 'Dans Dragon Ball, de quelle race est Goku ?', a: ['saiyan', 'saiyen'] },
    { q: 'Dans Death Note, quel est le prénom de Kira ?', a: ['light', 'light yagami'] },
    { q: 'Dans Demon Slayer, comment s’appelle la sœur de Tanjiro ?', a: ['nezuko', 'nezuko kamado'] },
    { q: 'Dans Jujutsu Kaisen, qui est le professeur aux Six Yeux ?', a: ['gojo', 'satoru gojo', 'gojo satoru'] },
    { q: 'Dans Attack on Titan, quel est le prénom d’Eren ?', a: ['eren', 'eren yeager', 'eren jaeger'] },
    { q: 'Dans My Hero Academia, quel est le surnom héroïque d’Izuku Midoriya ?', a: ['deku'] }
  ],
  general: [
    { q: 'Quelle planète est surnommée la planète rouge ?', a: ['mars'] },
    { q: 'Combien y a-t-il de continents selon le modèle le plus courant ?', a: ['7', 'sept'] },
    { q: 'Quel langage s’exécute nativement dans les navigateurs web ?', a: ['javascript', 'js'] },
    { q: 'Quelle est la capitale du Japon ?', a: ['tokyo'] },
    { q: 'Quel protocole sécurisé est généralement utilisé pour les sites web ?', a: ['https'] },
    { q: 'Combien font 12 × 8 ?', a: ['96', 'quatre vingt seize', 'quatre-vingt-seize'] }
  ]
});

const TRUTHS = Object.freeze([
  'Quelle est la chose la plus drôle que tu aies faite sans le dire à personne ?',
  'Quel personnage d’anime te ressemble le plus, et pourquoi ?',
  'Quelle habitude aimerais-tu vraiment changer ?',
  'Quel compliment t’a le plus marqué ?',
  'Quelle est ta plus grande petite peur irrationnelle ?',
  'Si tu pouvais revivre une journée, laquelle choisirais-tu ?'
]);

const DARES = Object.freeze([
  'Envoie un emoji qui décrit exactement ton humeur actuelle.',
  'Fais un compliment sincère à une personne du groupe.',
  'Écris une phrase dramatique comme si tu étais le héros d’un anime.',
  'Change temporairement ton statut avec une phrase positive.',
  'Écris trois mots qui te décrivent sans utiliser ton prénom.',
  'Raconte une blague courte au groupe.'
]);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

class GameMaster {
  constructor({ file = path.join(process.cwd(), 'data', 'exaucee', 'game-master.json') } = {}) {
    this.file = file;
    this.sessions = new Map();
    this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const game of Array.isArray(raw) ? raw : []) {
        if (game?.chatId) this.sessions.set(game.chatId, game);
      }
    } catch (_) {}
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...this.sessions.values()], null, 2));
    fs.renameSync(tmp, this.file);
  }

  get(chatId) {
    const game = this.sessions.get(chatId);
    return game ? structuredClone(game) : null;
  }

  stop(chatId) {
    const game = this.sessions.get(chatId);
    if (!game) return null;
    game.status = 'stopped';
    game.stoppedAt = Date.now();
    this._save();
    return structuredClone(game);
  }

  startQuiz(chatId, { by = null, category = 'anime', rounds = 5 } = {}) {
    const bank = QUIZ_BANKS[category] || QUIZ_BANKS.anime;
    const count = Math.max(1, Math.min(Number(rounds) || 5, bank.length));
    const questions = shuffled(bank).slice(0, count);
    const game = {
      id: `quiz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      chatId,
      type: 'quiz',
      category: QUIZ_BANKS[category] ? category : 'anime',
      status: 'playing',
      by,
      round: 1,
      totalRounds: questions.length,
      questionIndex: 0,
      questions,
      scores: {},
      startedAt: Date.now(),
      updatedAt: Date.now()
    };
    this.sessions.set(chatId, game);
    this._save();
    return { game: structuredClone(game), question: questions[0].q };
  }

  answerQuiz(chatId, userId, answer) {
    const game = this.sessions.get(chatId);
    if (!game || game.type !== 'quiz' || game.status !== 'playing') return { handled: false };
    const current = game.questions[game.questionIndex];
    if (!current) return { handled: false };
    const normalized = normalize(answer);
    const correct = current.a.some(expected => normalize(expected) === normalized);
    game.updatedAt = Date.now();

    if (!correct) {
      this._save();
      return { handled: true, correct: false, round: game.round, totalRounds: game.totalRounds };
    }

    game.scores[userId] = Number(game.scores[userId] || 0) + 1;
    const correctAnswer = current.a[0];
    game.questionIndex += 1;

    if (game.questionIndex >= game.questions.length) {
      game.status = 'finished';
      game.finishedAt = Date.now();
      this._save();
      return {
        handled: true,
        correct: true,
        finished: true,
        correctAnswer,
        scores: structuredClone(game.scores),
        game: structuredClone(game)
      };
    }

    game.round += 1;
    const nextQuestion = game.questions[game.questionIndex].q;
    this._save();
    return {
      handled: true,
      correct: true,
      finished: false,
      correctAnswer,
      round: game.round,
      totalRounds: game.totalRounds,
      nextQuestion,
      scores: structuredClone(game.scores)
    };
  }

  startTruthOrDare(chatId, { by = null } = {}) {
    const game = {
      id: `tod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      chatId,
      type: 'truth-or-dare',
      status: 'playing',
      by,
      turn: 0,
      history: [],
      startedAt: Date.now(),
      updatedAt: Date.now()
    };
    this.sessions.set(chatId, game);
    this._save();
    return structuredClone(game);
  }

  nextTruthOrDare(chatId, userId, choice = null) {
    const game = this.sessions.get(chatId);
    if (!game || game.type !== 'truth-or-dare' || game.status !== 'playing') return { handled: false };
    const normalizedChoice = normalize(choice);
    const type = /^(action|dare|defi)$/.test(normalizedChoice)
      ? 'action'
      : /^(verite|truth)$/.test(normalizedChoice)
        ? 'vérité'
        : Math.random() < 0.5 ? 'vérité' : 'action';
    const bank = type === 'vérité' ? TRUTHS : DARES;
    const prompt = bank[Math.floor(Math.random() * bank.length)];
    game.turn += 1;
    game.updatedAt = Date.now();
    game.history.push({ turn: game.turn, userId, type, prompt, ts: Date.now() });
    game.history = game.history.slice(-100);
    this._save();
    return { handled: true, type, prompt, turn: game.turn };
  }

  scoreboard(chatId) {
    const game = this.sessions.get(chatId);
    if (!game || game.type !== 'quiz') return null;
    return Object.entries(game.scores || {})
      .sort((a, b) => b[1] - a[1])
      .map(([userId, score], index) => ({ rank: index + 1, userId, score }));
  }
}

module.exports = { GameMaster, QUIZ_BANKS, normalize };
