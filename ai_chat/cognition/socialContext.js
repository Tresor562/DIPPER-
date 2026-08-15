'use strict';

function unwrap(message = {}) {
  let m = message || {};
  if (m.ephemeralMessage) m = m.ephemeralMessage.message || {};
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message || {};
  if (m.viewOnceMessage) m = m.viewOnceMessage.message || {};
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message || {};
  return m;
}

function textOf(message = {}) {
  const m = unwrap(message);
  return String(
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  ).trim();
}

function contextInfoOf(message = {}) {
  const m = unwrap(message);
  return m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo || {};
}

function normalizeJid(jid = '') {
  return String(jid || '').replace(/:\d+(?=@)/, '');
}

function shortJid(jid = '') {
  return normalizeJid(jid).split('@')[0] || 'inconnu';
}

function quotedText(contextInfo = {}) {
  return textOf(contextInfo.quotedMessage || {});
}

function extractSocialContext(msg, { botJids = [] } = {}) {
  const info = contextInfoOf(msg?.message || {});
  const mentions = Array.isArray(info.mentionedJid) ? info.mentionedJid.map(normalizeJid) : [];
  const knownBots = new Set((botJids || []).flatMap(j => [String(j), normalizeJid(j)]));
  const humanMentions = mentions.filter(j => !knownBots.has(j));
  const quotedParticipant = normalizeJid(info.participant || info.remoteJid || '');
  const qText = quotedText(info);

  return {
    speakerId: normalizeJid(msg?.key?.participant || msg?.key?.remoteJid || ''),
    speakerName: String(msg?.pushName || '').trim(),
    mentionedJids: mentions,
    mentionedHumans: humanMentions,
    mentionsBot: mentions.some(j => knownBots.has(j)),
    quoted: qText ? {
      messageId: info.stanzaId || null,
      participant: quotedParticipant || null,
      participantLabel: quotedParticipant ? shortJid(quotedParticipant) : null,
      text: qText.slice(0, 1800)
    } : null
  };
}

function formatGroupHistory(memory = {}, limit = 20) {
  return (memory.episodes || []).slice(-limit).map(ep => String(ep.value || '')).filter(Boolean);
}

function socialInstruction(social = {}, groupHistory = []) {
  const parts = [];
  if (social.speakerName) parts.push(`La personne qui te parle actuellement se présente comme « ${social.speakerName} ».`);
  if (social.quoted?.text) {
    parts.push(`Le message actuel répond explicitement à un message de ${social.quoted.participantLabel || 'quelqu’un'} : « ${social.quoted.text} ».`);
    parts.push('Interprète les pronoms et réponses courtes en priorité par rapport à ce message cité lorsqu’il fournit le contexte pertinent.');
  }
  if (social.mentionedHumans?.length) {
    parts.push(`Des personnes autres que toi sont mentionnées dans le message : ${social.mentionedHumans.map(j => '@' + shortJid(j)).join(', ')}. Ne suppose pas qu’une mention d’un autre membre t’est destinée.`);
  }
  if (groupHistory.length) {
    parts.push(`Fil social récent du groupe (les auteurs sont explicitement étiquetés) :\n${groupHistory.slice(-20).join('\n')}`);
    parts.push('Ne mélange jamais les déclarations de deux personnes différentes. Un fait dit par A à propos de lui-même ne devient pas un fait sur B.');
  }
  return parts.join('\n\n');
}

module.exports = { unwrap, textOf, contextInfoOf, normalizeJid, extractSocialContext, formatGroupHistory, socialInstruction };
