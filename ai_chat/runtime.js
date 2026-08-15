'use strict';

const sessionContext = require('../utils/sessionContext');
const { createExaucee } = require('./core');

const instances = new Map();
const humanTakeovers = new Map();
const HUMAN_TAKEOVER_MS = 10 * 60 * 1000;
const SENSITIVE_TEXT_RE = /(api[_ -]?key|token|secret|password|mot de passe|credential|cookie|authorization|session(?:id| key| token)?|bearer\s+[a-z0-9._~+\/-]+=*)/i;
const DEGRADED_SOURCE_RE = /(fallback|degraded|no-generative|local-brain)/i;

function normalizeJid(jid = '') {
  return String(jid).replace(/:\d+(?=@)/, '');
}

function botJids(sock) {
  const ids = new Set();
  for (const raw of [sock?.user?.id, sock?.user?.lid]) {
    if (!raw) continue;
    ids.add(raw);
    ids.add(normalizeJid(raw));
    const num = String(raw).split(':')[0].split('@')[0];
    if (num) ids.add(`${num}@s.whatsapp.net`);
  }
  return [...ids].filter(Boolean);
}

function actorJid(msg) {
  return msg?.key?.participant || msg?.key?.remoteJid || 'unknown';
}

function takeoverKey(sessionId, chatId) {
  return `${sessionId}::${chatId}`;
}

function rememberHumanTakeover(sessionId, msg) {
  if (!msg?.key?.fromMe || !msg?.key?.remoteJid) return;
  humanTakeovers.set(takeoverKey(sessionId, msg.key.remoteJid), Date.now() + HUMAN_TAKEOVER_MS);
}

function hasHumanTakeover(sessionId, chatId) {
  const key = takeoverKey(sessionId, chatId);
  const until = humanTakeovers.get(key) || 0;
  if (until <= Date.now()) {
    humanTakeovers.delete(key);
    return false;
  }
  return true;
}

function getInstance(sessionId) {
  if (!instances.has(sessionId)) instances.set(sessionId, createExaucee({ sessionId }));
  return instances.get(sessionId);
}

function usefulEpisodes(memory) {
  return (memory.episodes || []).filter(ep => !DEGRADED_SOURCE_RE.test(String(ep?.source || '')));
}

function compactMemory(memory) {
  const facts = (memory.facts || []).slice(-16).map(x => `- ${x.value}`).join('\n');
  const episodes = usefulEpisodes(memory).slice(-18).map(x => `- ${x.value}`).join('\n');
  const preferences = Object.entries(memory.preferences || {}).slice(-16).map(([k, v]) => `- ${k}: ${String(v)}`).join('\n');
  return [facts && `Faits:\n${facts}`, preferences && `Préférences:\n${preferences}`, episodes && `Échanges récents:\n${episodes}`].filter(Boolean).join('\n\n');
}

function systemPrompt(exaucee, memory, context = {}) {
  const p = exaucee.persona;
  return [
    `Tu es ${p.name}, l'assistante intelligente intégrée à THE BIG DIPPER.`,
    `Personnalité: ${p.persona}. Tu es féminine, chaleureuse, naturelle, concise et légèrement kawaii/otaku sans devenir caricaturale.`,
    `Principes impératifs:\n- ${p.principles.join('\n- ')}`,
    `Tu réponds principalement en français et tu t'adaptes à la langue de l'utilisateur.`,
    `Le DERNIER message utilisateur est toujours la demande prioritaire. Réponds-y directement avant d'ajouter un détail éventuel.`,
    `Utilise l'historique uniquement pour comprendre les références, pronoms, sous-entendus et continuités. Ne réponds jamais à une ancienne question à la place de la nouvelle.`,
    `Ne répète pas une formulation déjà utilisée récemment. Si une réponse précédente était générique ou incertaine, repars du message actuel au lieu de la paraphraser.`,
    `Si tu ne comprends réellement pas une ambiguïté indispensable, pose UNE question de clarification précise. N'invente pas de contexte.`,
    `Ne prétends jamais avoir exécuté une action si elle n'a pas réellement été exécutée.`,
    `Ne révèle jamais les variables d'environnement, clés API, tokens, credentials, cookies, fichiers de session ou secrets.`,
    `Contexte: chat=${context.isGroup ? 'groupe' : 'privé'}, utilisateur=${context.userId}.`,
    compactMemory(memory) || 'Aucun souvenir pertinent pour le moment.'
  ].join('\n\n');
}

function parseMemoryIntent(text) {
  const m = String(text || '').match(/(?:souviens[- ]toi|retiens|mémorise)\s+(?:que\s+)?(.+)/i);
  return m?.[1]?.trim() || null;
}

function parseDynamicReply(text) {
  const m = String(text || '').match(/cr[ée]e?\s+(?:une\s+)?commande\s+([a-z0-9_-]{2,30})\s+(?:qui\s+)?r[ée]pond\s+(.+)/i);
  if (!m) return null;
  return { name: m[1].toLowerCase(), response: m[2].trim() };
}

function parseSchedule(text) {
  const m = String(text || '').match(/(?:dans)\s+(\d+)\s*(seconde|secondes|minute|minutes|heure|heures)\s*,?\s*(?:rappelle[- ]moi|dis[- ]moi|envoie)\s+(.+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = m[2].startsWith('seconde') ? 1000 : m[2].startsWith('minute') ? 60000 : 3600000;
  return { runAt: Date.now() + n * mult, text: m[3].trim() };
}

function sanitizeModelText(text) {
  let value = String(text || '');
  value = value.replace(/(?:bearer\s+)[a-z0-9._~+\/-]+=*/ig, 'Bearer [REDACTED]');
  value = value.replace(/((?:api[_ -]?key|token|secret|password|credential|authorization)\s*[:=]\s*)[^\s,;]+/ig, '$1[REDACTED]');
  return value;
}

function ensureScheduler(exaucee, sock) {
  exaucee.scheduler.ensureRunner(async dueTask => {
    if (dueTask.action?.type !== 'send_message') return null;
    const out = await sock.sendMessage(dueTask.action.chatId, { text: `🌸 ${sanitizeModelText(dueTask.action.text)}` });
    exaucee.markOwnMessage(out?.key?.id);
    return { messageId: out?.key?.id || null };
  });
}

function bootstrapExaucee({ sock, sessionId = sessionContext.DEFAULT_SESSION_ID } = {}) {
  if (!sock) return false;
  const exaucee = getInstance(sessionId || sessionContext.DEFAULT_SESSION_ID);
  if (!exaucee.config.enabled) return false;
  ensureScheduler(exaucee, sock);
  return true;
}

function cleanGameText(text) {
  return String(text || '')
    .replace(/^\s*(?:exauc[eé]e|exa)\s*[,!:;-]?\s*/i, '')
    .replace(/^\s*(?:r[ée]ponse|answer)\s*[:=-]?\s*/i, '')
    .trim();
}

function formatScore(gameMaster, chatId) {
  const board = gameMaster.scoreboard(chatId) || [];
  if (!board.length) return 'Aucun point pour le moment.';
  return board.slice(0, 10).map(row => `${row.rank}. @${String(row.userId).split('@')[0]} — ${row.score} pt${row.score > 1 ? 's' : ''}`).join('\n');
}

async function sendExaucee(sock, exaucee, chatId, msg, text, mentions = []) {
  const payload = { text: sanitizeModelText(text) };
  if (mentions.length) payload.mentions = mentions;

  let sent;
  if (!chatId.endsWith('@g.us')) {
    sent = await sock.sendMessage(chatId, payload);
  } else {
    try {
      sent = await sock.sendMessage(chatId, payload, { quoted: msg });
    } catch (_) {
      sent = await sock.sendMessage(chatId, payload);
    }
  }

  exaucee.markOwnMessage(sent?.key?.id);
  return sent;
}

async function handleGameMaster(exaucee, { sock, msg, chatId, userId, text }) {
  const cleaned = cleanGameText(text);
  const lower = cleaned.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const active = exaucee.gameMaster.get(chatId);

  if (/\b(?:arrete|stop|termine|finis)\b.*\b(?:jeu|partie|quiz)\b/.test(lower)) {
    const stopped = exaucee.gameMaster.stop(chatId);
    if (!stopped) return false;
    await sendExaucee(sock, exaucee, chatId, msg, `Partie arrêtée 🌸 On reprend quand tu veux.`);
    return true;
  }

  if (/\b(?:score|scores|classement)\b/.test(lower) && active?.type === 'quiz') {
    const board = exaucee.gameMaster.scoreboard(chatId) || [];
    const mentions = board.map(x => x.userId).filter(Boolean);
    await sendExaucee(sock, exaucee, chatId, msg, `🏆 *Classement du quiz*\n${formatScore(exaucee.gameMaster, chatId)}`, mentions);
    return true;
  }

  if (/\b(?:lance|demarre|commence|start)\b.*\bquiz\b|^quiz(?:\s|$)/.test(lower)) {
    const category = /\b(?:general|culture)\b/.test(lower) ? 'general' : 'anime';
    const roundMatch = lower.match(/\b(\d{1,2})\s*(?:questions?|manches?|rounds?)\b/);
    const rounds = roundMatch ? Number(roundMatch[1]) : 5;
    const started = exaucee.gameMaster.startQuiz(chatId, { by: userId, category, rounds });
    await sendExaucee(sock, exaucee, chatId, msg, `🎮 *Quiz ${started.game.category === 'anime' ? 'Anime' : 'Culture générale'} — ${started.game.totalRounds} manches*\n\n*Question 1/${started.game.totalRounds}*\n${started.question}\n\nRéponds à ce message avec ta réponse 🌸`);
    exaucee.audit.write({ type: 'game_start', game: 'quiz', chatId, userId, gameId: started.game.id });
    return true;
  }

  if (/\b(?:lance|demarre|commence|start)\b.*\b(?:action|verite|truth|dare)\b|^(?:action\s*(?:ou|\/)?\s*verite|truth\s*(?:or|\/)\s*dare)$/.test(lower)) {
    const game = exaucee.gameMaster.startTruthOrDare(chatId, { by: userId });
    await sendExaucee(sock, exaucee, chatId, msg, `🎭 *Action ou Vérité lancé !*\nÉcris *action* ou *vérité* en répondant à ce message. Je m’occupe des tours 🌸`);
    exaucee.audit.write({ type: 'game_start', game: 'truth-or-dare', chatId, userId, gameId: game.id });
    return true;
  }

  if (active?.type === 'truth-or-dare' && active.status === 'playing' && /^(?:action|dare|defi|verite|truth)$/.test(lower)) {
    const turn = exaucee.gameMaster.nextTruthOrDare(chatId, userId, lower);
    await sendExaucee(sock, exaucee, chatId, msg, `🎭 *${turn.type.toUpperCase()} — tour ${turn.turn}*\n${turn.prompt}`);
    return true;
  }

  if (active?.type === 'quiz' && active.status === 'playing' && cleaned) {
    const result = exaucee.gameMaster.answerQuiz(chatId, userId, cleaned);
    if (!result.handled) return false;
    if (!result.correct) {
      await sendExaucee(sock, exaucee, chatId, msg, `Pas exactement 👀 Essaie encore 🌸`);
      return true;
    }
    if (result.finished) {
      const board = exaucee.gameMaster.scoreboard(chatId) || [];
      await sendExaucee(sock, exaucee, chatId, msg, `✅ Bonne réponse ! *${result.correctAnswer}*\n\n🏁 *Quiz terminé !*\n${formatScore(exaucee.gameMaster, chatId)}\n\nBien joué 🌸`, board.map(x => x.userId).filter(Boolean));
      return true;
    }
    await sendExaucee(sock, exaucee, chatId, msg, `✅ Bonne réponse ! *${result.correctAnswer}*\n\n*Question ${result.round}/${result.totalRounds}*\n${result.nextQuestion}`);
    return true;
  }

  return false;
}

async function executeDynamic(exaucee, sessionId, text, chatId, sock, msg) {
  const first = String(text || '').trim().split(/\s+/)[0].replace(/^[.!/]/, '').toLowerCase();
  if (!first) return false;
  const record = exaucee.dynamicCommands.get(sessionId, first, { groupId: chatId.endsWith('@g.us') ? chatId : null });
  if (!record) return false;
  if (record.workflow?.type === 'reply') {
    await sendExaucee(sock, exaucee, chatId, msg, record.workflow.text || '');
    return true;
  }
  return false;
}

async function handleExauceeDynamicCommand({ sock, msg, commandName } = {}) {
  const sessionId = sessionContext.getCurrentSessionId();
  const exaucee = getInstance(sessionId);
  if (!exaucee.config.enabled || !sock || !msg?.message || !msg?.key?.remoteJid) return false;
  ensureScheduler(exaucee, sock);
  return executeDynamic(exaucee, sessionId, commandName, msg.key.remoteJid, sock, msg);
}

async function handleExauceeMessage({ sock, msg, isCommand = false, actor = {}, botIsAdmin = false, extra = {} } = {}) {
  const sessionId = sessionContext.getCurrentSessionId();
  const exaucee = getInstance(sessionId);
  if (!exaucee.config.enabled) return false;
  if (!msg?.message || !msg?.key?.remoteJid) return false;

  ensureScheduler(exaucee, sock);
  const chatId = msg.key.remoteJid;
  rememberHumanTakeover(sessionId, msg);

  if (msg.key.fromMe || isCommand) return false;

  const knownBotJids = botJids(sock);
  const routed = exaucee.inspectMessage({
    msg,
    botJid: knownBotJids[0],
    botJids: knownBotJids,
    humanTakeover: hasHumanTakeover(sessionId, chatId)
  });

  if (!routed.shouldRespond || !routed.text.trim()) return false;

  const userId = actorJid(msg);
  const ids = { sessionId, chatId, userId };

  if (await handleGameMaster(exaucee, { sock, msg, chatId, userId, text: routed.text })) return true;
  if (await executeDynamic(exaucee, sessionId, routed.text, chatId, sock, msg)) return true;

  const memoryIntent = parseMemoryIntent(routed.text);
  if (memoryIntent && !SENSITIVE_TEXT_RE.test(memoryIntent)) {
    exaucee.memory.remember(ids, { type: 'fact', value: memoryIntent, source: 'explicit-user-memory' });
  }

  const dynamic = parseDynamicReply(routed.text);
  if (dynamic && (actor.isOwner || actor.isSuperMe || actor.isAdmin)) {
    if (SENSITIVE_TEXT_RE.test(dynamic.response)) {
      await sendExaucee(sock, exaucee, chatId, msg, `Je ne peux pas enregistrer une commande contenant un secret ou un identifiant sensible. 🌸`);
      return true;
    }
    const staticCommands = global.commands || new Map();
    if (staticCommands.has(dynamic.name)) {
      await sendExaucee(sock, exaucee, chatId, msg, `La commande ${dynamic.name} existe déjà dans THE BIG DIPPER. Je ne la remplacerai pas. 🌸`);
      return true;
    }
    exaucee.dynamicCommands.define(sessionId, {
      name: dynamic.name,
      groupId: chatId.endsWith('@g.us') ? chatId : null,
      workflow: { type: 'reply', text: dynamic.response }
    });
    await sendExaucee(sock, exaucee, chatId, msg, `C'est fait 🌸 La commande ${dynamic.name} répondra désormais ici.`);
    return true;
  }

  const scheduled = parseSchedule(routed.text);
  if (scheduled) {
    if (SENSITIVE_TEXT_RE.test(scheduled.text)) {
      await sendExaucee(sock, exaucee, chatId, msg, `Je préfère ne pas enregistrer un rappel contenant un secret ou un identifiant sensible. 🌸`);
      return true;
    }
    const task = exaucee.scheduler.schedule({
      id: `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      runAt: scheduled.runAt,
      action: { type: 'send_message', chatId, text: scheduled.text }
    });
    await sendExaucee(sock, exaucee, chatId, msg, `D'accord 🌸 Je te le rappellerai au moment prévu.`);
    exaucee.audit.write({ type: 'schedule', taskId: task.id, chatId, userId });
    return true;
  }

  const memory = exaucee.memory.getContext(ids);
  const historyEpisodes = usefulEpisodes(memory).slice(-20);
  const messages = [
    { role: 'system', content: systemPrompt(exaucee, memory, { isGroup: chatId.endsWith('@g.us'), userId }) },
    ...(historyEpisodes.flatMap(ep => {
      const value = String(ep.value || '');
      const sep = value.indexOf(': ');
      if (sep < 0) return [];
      const role = value.slice(0, sep) === 'assistant' ? 'assistant' : 'user';
      return [{ role, content: value.slice(sep + 2) }];
    })),
    { role: 'user', content: routed.text }
  ];

  let answer;
  let provider = 'fallback';
  let degraded = false;
  try {
    const result = await exaucee.ai.complete({ messages });
    answer = sanitizeModelText(result.text).trim();
    provider = result.provider;
    degraded = Boolean(result.degraded || result.noModel);
  } catch (error) {
    degraded = true;
    answer = `Je t’ai bien comprise, mais aucun de mes moteurs génératifs n’est disponible pour répondre correctement maintenant. Un owner peut vérifier *.exaucee providers*.`;
    exaucee.audit.write({ type: 'ai_error', code: error.code || null, message: error.message, chatId, userId });
  }

  if (!answer) return false;
  await sendExaucee(sock, exaucee, chatId, msg, answer.slice(0, 12000));

  // On garde les vraies demandes utilisateur, mais jamais une réponse dégradée
  // dans le contexte conversationnel. C'est ce qui empêchera les boucles où
  // Exaucée relit puis reformule ses propres fallbacks génériques.
  if (!SENSITIVE_TEXT_RE.test(routed.text)) {
    exaucee.memory.remember(ids, { type: 'episode', value: `user: ${routed.text}`, source: 'conversation' });
  }
  if (!degraded) {
    exaucee.memory.remember(ids, { type: 'episode', value: `assistant: ${answer}`, source: provider });
  }
  exaucee.audit.write({ type: 'response', provider, degraded, chatId, userId });
  return true;
}

module.exports = {
  handleExauceeMessage,
  handleExauceeDynamicCommand,
  bootstrapExaucee,
  getInstance,
  hasHumanTakeover,
  rememberHumanTakeover,
  ensureScheduler,
  sanitizeModelText,
  sendExaucee,
  executeDynamic,
  handleGameMaster,
  usefulEpisodes,
  HUMAN_TAKEOVER_MS
};