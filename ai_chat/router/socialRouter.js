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

function routeMessage({ msg, botJid, recentExauceeMessageIds = new Set(), humanTakeover = false }) {
  const chatId = msg?.key?.remoteJid || '';
  const isGroup = chatId.endsWith('@g.us');
  const text = getText(msg?.message || {});
  const quotedId = unwrapMessage(msg?.message || {})?.extendedTextMessage?.contextInfo?.stanzaId || null;
  const mentions = unwrapMessage(msg?.message || {})?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const replyToExaucee = quotedId ? recentExauceeMessageIds.has(quotedId) : false;
  const explicitName = NAME_RE.test(text);
  const explicitMention = botJid ? mentions.includes(botJid) : false;

  if (msg?.key?.fromMe && !replyToExaucee) return { shouldRespond: false, reason: 'human-connected-account' };
  if (!isGroup && humanTakeover && !explicitName && !replyToExaucee) return { shouldRespond: false, reason: 'human-takeover' };
  if (!isGroup) return { shouldRespond: true, reason: replyToExaucee ? 'reply-to-exaucee' : 'private-chat' };
  if (replyToExaucee) return { shouldRespond: true, reason: 'reply-to-exaucee' };
  if (explicitMention || explicitName) return { shouldRespond: true, reason: explicitMention ? 'explicit-mention' : 'explicit-name' };
  return { shouldRespond: false, reason: 'group-human-conversation' };
}

module.exports = { getText, routeMessage };
