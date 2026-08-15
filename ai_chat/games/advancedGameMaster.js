'use strict';

const fs = require('fs');
const path = require('path');

const QUIZ_BANKS = Object.freeze({
  anime: [
    { q: 'Dans Naruto, quel est le nom du village de Naruto ?', a: ['konoha', 'village cache de la feuille'] },
    { q: 'Dans One Piece, comment s’appelle le capitaine des Mugiwara ?', a: ['luffy', 'monkey d luffy'] },
    { q: 'Dans Dragon Ball, de quelle race est Goku ?', a: ['saiyan', 'saiyen'] },
    { q: 'Dans Death Note, quel est le prénom de Kira ?', a: ['light', 'light yagami'] },
    { q: 'Dans Demon Slayer, comment s’appelle la sœur de Tanjiro ?', a: ['nezuko', 'nezuko kamado'] },
    { q: 'Dans Jujutsu Kaisen, qui est le professeur aux Six Yeux ?', a: ['gojo', 'satoru gojo'] },
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
  'Si tu pouvais revivre une journée, laquelle choisirais-tu ?'
]);

const DARES = Object.freeze([
  'Envoie un emoji qui décrit exactement ton humeur actuelle.',
  'Fais un compliment sincère à une personne du groupe.',
  'Écris une phrase dramatique comme si tu étais le héros d’un anime.',
  'Écris trois mots qui te décrivent sans utiliser ton prénom.',
  'Raconte une blague courte au groupe.'
]);

const MYSTERY = Object.freeze([
  { answer: 'naruto', clues: ['Je viens de Konoha.', 'Je rêve de devenir Hokage.', 'Kurama a longtemps vécu en moi.'] },
  { answer: 'luffy', clues: ['Je suis un pirate.', 'Mon corps est élastique.', 'Je veux devenir le Roi des Pirates.'] },
  { answer: 'gojo', clues: ['Je suis professeur.', 'Je possède les Six Yeux.', 'On me décrit souvent comme le plus fort.'] },
  { answer: 'eren', clues: ['Je viens de Paradis.', 'Les Titans ont bouleversé ma vie.', 'Je peux moi-même devenir un Titan.'] },
  { answer: 'goku', clues: ['Je ne suis pas humain.', 'J’adore combattre.', 'Je suis un Saiyan élevé sur Terre.'] }
]);

const HANGMAN_WORDS = Object.freeze(['konoha', 'chakra', 'pirate', 'saiyan', 'manga', 'anime', 'javascript', 'cybersecurite', 'robotique']);

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9#_-]+/g, ' ').trim();
}

function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shortId(id) { return String(id || '').split('_').pop().slice(-6); }
function makeId(type) { return `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

class AdvancedGameMaster {
  constructor({ file = path.join(process.cwd(), 'data', 'exaucee', 'games.json') } = {}) {
    this.file = file;
    this.games = new Map();
    this._load();
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.games) ? raw.games : [];
      for (const game of rows) {
        if (!game?.chatId) continue;
        const id = game.id || makeId(game.type || 'game');
        this.games.set(id, { ...game, id, alias: game.alias || shortId(id) });
      }
    } catch (_) {}
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 2, games: [...this.games.values()] }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  _put(game) {
    game.alias = game.alias || shortId(game.id);
    game.updatedAt = Date.now();
    this.games.set(game.id, game);
    this._save();
    return structuredClone(game);
  }

  list(chatId, { activeOnly = false, type = null } = {}) {
    return [...this.games.values()]
      .filter(g => g.chatId === chatId)
      .filter(g => !activeOnly || g.status === 'playing')
      .filter(g => !type || g.type === type)
      .sort((a, b) => Number(b.updatedAt || b.startedAt || 0) - Number(a.updatedAt || a.startedAt || 0))
      .map(g => structuredClone(g));
  }

  activeCount(chatId) { return this.list(chatId, { activeOnly: true }).length; }

  resolve(chatId, ref = null, type = null) {
    const candidates = this.list(chatId, { activeOnly: true, type });
    if (!ref) return candidates[0] || null;
    const needle = normalize(ref).replace(/^#/, '');
    return candidates.find(g => g.id === ref || normalize(g.alias) === needle || normalize(shortId(g.id)) === needle || normalize(g.id).endsWith(needle)) || null;
  }

  get(chatId, ref = null) { return this.resolve(chatId, ref); }

  stop(chatId, ref = null) {
    const game = this.resolve(chatId, ref);
    if (!game) return null;
    const live = this.games.get(game.id);
    live.status = 'stopped';
    live.stoppedAt = Date.now();
    return this._put(live);
  }

  stopAll(chatId) {
    const stopped = [];
    for (const game of this.list(chatId, { activeOnly: true })) stopped.push(this.stop(chatId, game.id));
    return stopped;
  }

  startQuiz(chatId, { by = null, category = 'anime', rounds = 5, alias = null } = {}) {
    const bank = QUIZ_BANKS[category] || QUIZ_BANKS.anime;
    const count = Math.max(1, Math.min(Number(rounds) || 5, bank.length));
    const questions = shuffled(bank).slice(0, count);
    const id = makeId('quiz');
    const game = this._put({ id, alias: alias || shortId(id), chatId, type: 'quiz', category: QUIZ_BANKS[category] ? category : 'anime', status: 'playing', by, round: 1, totalRounds: questions.length, questionIndex: 0, questions, scores: {}, players: {}, startedAt: Date.now() });
    return { game, question: questions[0].q };
  }

  answerQuiz(chatId, userId, answer, ref = null) {
    let cleaned = String(answer || '').trim();
    const tag = cleaned.match(/#([a-z0-9_-]{2,32})/i);
    if (!ref && tag) ref = tag[1];
    if (tag) cleaned = cleaned.replace(tag[0], '').trim();
    const game = this.resolve(chatId, ref, 'quiz');
    if (!game || game.status !== 'playing') return { handled: false };
    const live = this.games.get(game.id);
    const current = live.questions[live.questionIndex];
    if (!current) return { handled: false };
    live.players[userId] = { joinedAt: live.players[userId]?.joinedAt || Date.now(), lastActiveAt: Date.now() };
    const n = normalize(cleaned);
    const correct = current.a.some(expected => normalize(expected) === n);
    if (!correct) { this._put(live); return { handled: true, correct: false, game: structuredClone(live) }; }
    live.scores[userId] = Number(live.scores[userId] || 0) + 1;
    const correctAnswer = current.a[0];
    live.questionIndex += 1;
    if (live.questionIndex >= live.questions.length) {
      live.status = 'finished'; live.finishedAt = Date.now(); this._put(live);
      return { handled: true, correct: true, finished: true, correctAnswer, scores: structuredClone(live.scores), game: structuredClone(live) };
    }
    live.round += 1;
    const nextQuestion = live.questions[live.questionIndex].q;
    this._put(live);
    return { handled: true, correct: true, finished: false, correctAnswer, round: live.round, totalRounds: live.totalRounds, nextQuestion, scores: structuredClone(live.scores), game: structuredClone(live) };
  }

  startTruthOrDare(chatId, { by = null, alias = null } = {}) {
    const id = makeId('tod');
    return this._put({ id, alias: alias || shortId(id), chatId, type: 'truth-or-dare', status: 'playing', by, turn: 0, history: [], players: {}, startedAt: Date.now() });
  }

  nextTruthOrDare(chatId, userId, choice = null, ref = null) {
    let cleaned = String(choice || '');
    const tag = cleaned.match(/#([a-z0-9_-]{2,32})/i);
    if (!ref && tag) ref = tag[1];
    if (tag) cleaned = cleaned.replace(tag[0], '').trim();
    const game = this.resolve(chatId, ref, 'truth-or-dare');
    if (!game) return { handled: false };
    const live = this.games.get(game.id);
    const n = normalize(cleaned);
    const type = /^(action|dare|defi)$/.test(n) ? 'action' : /^(verite|truth)$/.test(n) ? 'vérité' : Math.random() < 0.5 ? 'vérité' : 'action';
    const bank = type === 'vérité' ? TRUTHS : DARES;
    const prompt = bank[Math.floor(Math.random() * bank.length)];
    live.turn += 1;
    live.players[userId] = { joinedAt: live.players[userId]?.joinedAt || Date.now(), lastActiveAt: Date.now() };
    live.history.push({ turn: live.turn, userId, type, prompt, ts: Date.now() });
    live.history = live.history.slice(-250);
    this._put(live);
    return { handled: true, type, prompt, turn: live.turn, game: structuredClone(live) };
  }

  startMystery(chatId, { by = null, alias = null } = {}) {
    const picked = MYSTERY[Math.floor(Math.random() * MYSTERY.length)];
    const id = makeId('mystery');
    const game = this._put({ id, alias: alias || shortId(id), chatId, type: 'mystery-character', status: 'playing', by, answer: picked.answer, clues: picked.clues, clueIndex: 0, attempts: [], scores: {}, players: {}, startedAt: Date.now() });
    return { game, clue: picked.clues[0] };
  }

  guessMystery(chatId, userId, guess, ref = null) {
    let cleaned = String(guess || '');
    const tag = cleaned.match(/#([a-z0-9_-]{2,32})/i);
    if (!ref && tag) ref = tag[1];
    if (tag) cleaned = cleaned.replace(tag[0], '').trim();
    const game = this.resolve(chatId, ref, 'mystery-character');
    if (!game) return { handled: false };
    const live = this.games.get(game.id);
    live.players[userId] = { joinedAt: live.players[userId]?.joinedAt || Date.now(), lastActiveAt: Date.now() };
    const correct = normalize(cleaned) === normalize(live.answer);
    live.attempts.push({ userId, guess: cleaned.slice(0, 100), correct, ts: Date.now() });
    if (correct) {
      const points = Math.max(1, 3 - live.clueIndex);
      live.scores[userId] = Number(live.scores[userId] || 0) + points;
      live.status = 'finished'; live.finishedAt = Date.now(); this._put(live);
      return { handled: true, correct: true, answer: live.answer, points, game: structuredClone(live) };
    }
    live.clueIndex = Math.min(live.clueIndex + 1, live.clues.length - 1);
    this._put(live);
    return { handled: true, correct: false, clue: live.clues[live.clueIndex], clueIndex: live.clueIndex, game: structuredClone(live) };
  }

  startHangman(chatId, { by = null, alias = null, word = null } = {}) {
    const chosen = normalize(word || HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)]).replace(/\s/g, '');
    const id = makeId('hangman');
    const game = this._put({ id, alias: alias || shortId(id), chatId, type: 'hangman', status: 'playing', by, word: chosen, guessed: [], misses: 0, maxMisses: 7, players: {}, scores: {}, startedAt: Date.now() });
    return { game, display: this.hangmanDisplay(game) };
  }

  hangmanDisplay(game) {
    const set = new Set(game.guessed || []);
    return String(game.word || '').split('').map(ch => set.has(ch) ? ch.toUpperCase() : '_').join(' ');
  }

  playHangman(chatId, userId, input, ref = null) {
    let cleaned = normalize(input);
    const tag = cleaned.match(/#([a-z0-9_-]{2,32})/i);
    if (!ref && tag) ref = tag[1];
    if (tag) cleaned = normalize(cleaned.replace(tag[0], ''));
    const game = this.resolve(chatId, ref, 'hangman');
    if (!game) return { handled: false };
    const live = this.games.get(game.id);
    live.players[userId] = { joinedAt: live.players[userId]?.joinedAt || Date.now(), lastActiveAt: Date.now() };
    let correct = false;
    if (cleaned.length > 1) {
      correct = cleaned === live.word;
      if (correct) live.guessed = [...new Set([...live.guessed, ...live.word.split('')])];
      else live.misses += 1;
    } else if (/^[a-z0-9]$/.test(cleaned)) {
      if (!live.guessed.includes(cleaned)) live.guessed.push(cleaned);
      correct = live.word.includes(cleaned);
      if (!correct) live.misses += 1;
    } else return { handled: false };
    const won = live.word.split('').every(ch => live.guessed.includes(ch));
    const lost = live.misses >= live.maxMisses;
    if (won || lost) { live.status = 'finished'; live.finishedAt = Date.now(); }
    if (won) live.scores[userId] = Number(live.scores[userId] || 0) + 1;
    this._put(live);
    return { handled: true, correct, won, lost, word: live.word, misses: live.misses, maxMisses: live.maxMisses, display: this.hangmanDisplay(live), game: structuredClone(live) };
  }

  scoreboard(chatId, ref = null) {
    const game = this.resolve(chatId, ref) || this.list(chatId)[0];
    if (!game) return null;
    return Object.entries(game.scores || {}).sort((a, b) => b[1] - a[1]).map(([userId, score], index) => ({ rank: index + 1, userId, score }));
  }
}

module.exports = { AdvancedGameMaster, QUIZ_BANKS, MYSTERY, HANGMAN_WORDS, normalize, shortId };
