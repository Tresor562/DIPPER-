'use strict';

const NAME_RE = /\b(exauc[eé]e|exa)\b/i;

function unwrapMessage(message = {}) {
  let m = message;
  if (m.ephemeralMessage) m = m.ephemeralMessage.message || {};
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message || {};
  if (m.viewOnceMessage) m = m.viewOnceMessage.message || {};
  return m;
}

function getText(message = {}) {
  const m = unwrapMessage(message);
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '';
}

function normalizeJid(jid = '') {
  return String(jid).replace(/:\d+(?=@)/, '');
}

function routeMessage({ msg, botJid, botJids = [], recentExauceeMessageIds = new Set(), humanTakeover = false }) {
  const chatId = msg?.key?.remoteJid || '';
  const isGroup = chatId.endsWith('@g.us');
  const text = getText(msg?.message || {});
  const unwrapped = unwrapMessage(msg?.message || {});
  const contextInfo = unwrapped?.extendedTextMessage?.contextInfo ||
    unwrapped?.imageMessage?.contextInfo ||
    unwrapped?.videoMessage?.contextInfo ||
    unwrapped?.documentMessage?.contextInfo || {};
  const quotedId = contextInfo?.stanzaId || null;
  const mentions = contextInfo?.mentionedJid || [];
  const replyToExaucee = quotedId ? recentExauceeMessageIds.has(quotedId) : false;
  const explicitName = NAME_RE.test(text);
  const knownBotJids = new Set([botJid, ...botJids].filter(Boolean).flatMap(j => [String(j), normalizeJid(j)]));
  const explicitMention = mentions.some(j => knownBotJids.has(String(j)) || knownBotJids.has(normalizeJid(j)));

  if (msg?.key?.fromMe && !replyToExaucee) return { shouldRespond: false, reason: 'human-connected-account' };
  if (!isGroup && humanTakeover && !explicitName && !replyToExaucee) return { shouldRespond: false, reason: 'human-takeover' };
  if (!isGroup) return { shouldRespond: true, reason: replyToExaucee ? 'reply-to-exaucee' : 'private-chat' };
  if (replyToExaucee) return { shouldRespond: true, reason: 'reply-to-exaucee' };
  if (explicitMention || explicitName) return { shouldRespond: true, reason: explicitMention ? 'explicit-mention' : 'explicit-name' };
  return { shouldRespond: false, reason: 'group-human-conversation' };
}

module.exports = { getText, routeMessage, normalizeJid };
