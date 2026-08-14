'use strict';

const sessionContext = require('../utils/sessionContext');
const { createExaucee } = require('./core');

const instances = new Map();
const humanTakeovers = new Map();
const HUMAN_TAKEOVER_MS = 10 * 60 * 1000;

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
  if (!instances.has(sessionId)) {
    instances.set(sessionId, createExaucee());
  }
  return instances.get(sessionId);
}

function compactMemory(memory) {
  const facts = (memory.facts || []).slice(-12).map(x => `- ${x.value}`).join('\n');
  const episodes = (memory.episodes || []).slice(-10).map(x => `- ${x.value}`).join('\n');
  const preferences = Object.entries(memory.preferences || {}).slice(-12).map(([k, v]) => `- ${k}: ${String(v)}`).join('\n');
  return [facts && `Faits:\n${facts}`, preferences && `Préférences:\n${preferences}`, episodes && `Échanges récents:\n${episodes}`].filter(Boolean).join('\n\n');
}

function systemPrompt(exaucee, memory, context = {}) {
  const p = exaucee.persona;
  return [
    `Tu es ${p.name}, l'assistante intelligente intégrée à THE BIG DIPPER.`,
    `Personnalité: ${p.persona}. Tu es féminine, chaleureuse, naturelle, concise et légèrement kawaii/otaku sans devenir caricaturale.`,
    `Principes impératifs:\n- ${p.principles.join('\n- ')}`,
    `Tu réponds principalement en français et tu t'adaptes à la langue de l'utilisateur.`,
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

async function executeDynamic(exaucee, sessionId, text, chatId, sock, msg) {
  const first = String(text || '').trim().split(/\s+/)[0].replace(/^[.!/]/, '').toLowerCase();
  if (!first) return false;
  const record = exaucee.dynamicCommands.get(sessionId, first, { groupId: chatId.endsWith('@g.us') ? chatId : null });
  if (!record) return false;
  if (record.workflow?.type === 'reply') {
    const sent = await sock.sendMessage(chatId, { text: String(record.workflow.text || '') }, { quoted: msg });
    exaucee.markOwnMessage(sent?.key?.id);
    return true;
  }
  return false;
}

async function handleExauceeMessage({ sock, msg, isCommand = false, actor = {}, botIsAdmin = false, extra = {} } = {}) {
  const sessionId = sessionContext.getCurrentSessionId();
  const exaucee = getInstance(sessionId);
  if (!exaucee.config.enabled) return false;
  if (!msg?.message || !msg?.key?.remoteJid) return false;

  const chatId = msg.key.remoteJid;
  rememberHumanTakeover(sessionId, msg);

  if (msg.key.fromMe) return false;
  if (isCommand) return false;

  const text = exaucee.inspectMessage({
    msg,
    botJid: botJids(sock)[0],
    humanTakeover: hasHumanTakeover(sessionId, chatId)
  });

  if (!text.shouldRespond || !text.text.trim()) return false;

  // Mentions LID/s.whatsapp.net alternatives: si le routeur n'a pas détecté la
  // mention exacte, le nom "Exaucée" ou une réponse à elle restent suffisants.
  const userId = actorJid(msg);
  const ids = { sessionId, chatId, userId };

  if (await executeDynamic(exaucee, sessionId, text.text, chatId, sock, msg)) return true;

  const memoryIntent = parseMemoryIntent(text.text);
  if (memoryIntent) {
    exaucee.memory.remember(ids, { type: 'fact', value: memoryIntent, source: 'explicit-user-memory' });
  }

  const dynamic = parseDynamicReply(text.text);
  if (dynamic && (actor.isOwner || actor.isSuperMe || actor.isAdmin)) {
    exaucee.dynamicCommands.define(sessionId, {
      name: dynamic.name,
      groupId: chatId.endsWith('@g.us') ? chatId : null,
      workflow: { type: 'reply', text: dynamic.response }
    });
    const sent = await sock.sendMessage(chatId, { text: `C'est fait 🌸 La commande ${dynamic.name} répondra désormais ici.` }, { quoted: msg });
    exaucee.markOwnMessage(sent?.key?.id);
    return true;
  }

  const scheduled = parseSchedule(text.text);
  if (scheduled) {
    const task = exaucee.scheduler.schedule({
      id: `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      runAt: scheduled.runAt,
      action: { type: 'send_message', chatId, text: scheduled.text }
    });
    exaucee.scheduler.ensureRunner(async dueTask => {
      if (dueTask.action?.type !== 'send_message') return null;
      const out = await sock.sendMessage(dueTask.action.chatId, { text: `🌸 ${dueTask.action.text}` });
      exaucee.markOwnMessage(out?.key?.id);
      return { messageId: out?.key?.id || null };
    });
    const sent = await sock.sendMessage(chatId, { text: `D'accord 🌸 Je te le rappellerai au moment prévu.` }, { quoted: msg });
    exaucee.markOwnMessage(sent?.key?.id);
    exaucee.audit.write({ type: 'schedule', taskId: task.id, chatId, userId });
    return true;
  }

  const memory = exaucee.memory.getContext(ids);
  const messages = [
    { role: 'system', content: systemPrompt(exaucee, memory, { isGroup: chatId.endsWith('@g.us'), userId }) },
    ...((memory.episodes || []).slice(-8).flatMap(ep => {
      const value = String(ep.value || '');
      const sep = value.indexOf(': ');
      if (sep < 0) return [];
      const role = value.slice(0, sep) === 'assistant' ? 'assistant' : 'user';
      return [{ role, content: value.slice(sep + 2) }];
    })),
    { role: 'user', content: text.text }
  ];

  let answer;
  let provider = 'fallback';
  try {
    const result = await exaucee.ai.complete({ messages });
    answer = result.text.trim();
    provider = result.provider;
  } catch (error) {
    answer = `Je suis bien là 🌸 Mais mon moteur IA gratuit est momentanément indisponible. Réessaie dans un instant.`;
    exaucee.audit.write({ type: 'ai_error', code: error.code || null, message: error.message, chatId, userId });
  }

  if (!answer) return false;
  const sent = await sock.sendMessage(chatId, { text: answer.slice(0, 12000) }, { quoted: msg });
  exaucee.markOwnMessage(sent?.key?.id);
  exaucee.memory.remember(ids, { type: 'episode', value: `user: ${text.text}`, source: 'conversation' });
  exaucee.memory.remember(ids, { type: 'episode', value: `assistant: ${answer}`, source: provider });
  exaucee.audit.write({ type: 'response', provider, chatId, userId, messageId: sent?.key?.id || null });
  return true;
}

module.exports = {
  handleExauceeMessage,
  getInstance,
  hasHumanTakeover,
  rememberHumanTakeover,
  HUMAN_TAKEOVER_MS
};
