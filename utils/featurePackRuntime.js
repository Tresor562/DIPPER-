'use strict';

const config = require('../config');
const database = require('../database');
const { buildConnectionContext } = require('./connectionPresentation');

function getText(msg) {
  return String(msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || msg?.message?.imageMessage?.caption || msg?.message?.videoMessage?.caption || '');
}

function sessionPref(key, fallback = false) {
  try { const prefs = require('./sessionPreferences'); return prefs.get(key, fallback) === true; }
  catch (_) { return fallback === true; }
}

async function applyAutoPresence(sock, jid) {
  if (!jid || typeof sock?.sendPresenceUpdate !== 'function') return null;
  const recording = sessionPref('autoRecording', String(process.env.AUTO_RECORDING || '').toLowerCase() === 'true');
  const typing = sessionPref('autoTyping', config.autoTyping === true || String(process.env.AUTO_TYPING || '').toLowerCase() === 'true');
  const presence = recording ? 'recording' : typing ? 'composing' : null;
  if (!presence) return null;
  try {
    await sock.sendPresenceUpdate(presence, jid);
    await new Promise(resolve => { const timer = setTimeout(resolve, 450); if (timer.unref) timer.unref(); });
  } catch (_) {}
  return presence;
}

function participantJid(participant) { return participant?.jid || participant?.id || participant?.lid || participant?.userJid || ''; }

function normalizeNum(jid) { return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, ''); }

function isAdminParticipant(metadata, jid) {
  const target = normalizeNum(jid);
  if (!target) return false;
  const found = (metadata?.participants || []).find(p => [p?.id, p?.jid, p?.lid, p?.userJid].filter(Boolean).some(id => normalizeNum(id) === target));
  return !!found && (found.admin === 'admin' || found.admin === 'superadmin' || found.isAdmin === true || found.isSuperAdmin === true);
}

function isConfiguredOwner(jid) {
  const num = normalizeNum(jid);
  const owners = [...(Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber]), ...(config.supremeOwners || [])];
  return owners.filter(Boolean).some(value => String(value).replace(/\D/g, '') === num);
}

function hasWhatsAppLink(text) {
  return /(?:https?:\/\/)?(?:chat\.)?whatsapp\.com\/(?:channel\/|[A-Za-z0-9_-]{5,})|(?:https?:\/\/)?wa\.me\/\d+|(?:https?:\/\/)?api\.whatsapp\.com\/send|whatsapp:\/\//i.test(String(text || ''));
}

async function handleAntiwalink(sock, msg, groupMetadata) {
  const from = msg?.key?.remoteJid;
  if (!from?.endsWith('@g.us')) return false;
  const settings = database.getGroupSettings(from) || {};
  if (settings.antiwalink !== true || !hasWhatsAppLink(getText(msg))) return false;
  const sender = msg.key.participant || from;
  if (msg.key.fromMe || isConfiguredOwner(sender) || isAdminParticipant(groupMetadata, sender)) return false;
  try { await sock.sendMessage(from, { delete: msg.key }); } catch (_) {}
  if (String(settings.antiwalinkAction || 'delete').toLowerCase() === 'kick') {
    try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch (_) {}
  }
  return true;
}

async function handleAdminAtAll({ sock, msg, from, sender, body, groupMetadata, isAdmin, isOwner }) {
  if (!from?.endsWith('@g.us')) return false;
  if (!/^@(all|everyone)(?:\s|$)/i.test(String(body || '').trim())) return false;
  if (!isAdmin && !isOwner && !msg?.key?.fromMe) return false;
  const participants = (groupMetadata?.participants || []).map(participantJid).filter(jid => typeof jid === 'string' && jid.includes('@'));
  if (!participants.length) return false;
  const senderNumber = normalizeNum(sender || msg.key.participant || msg.key.remoteJid);
  const contextInfo = await buildConnectionContext(sock, { title: '📣 Appel général', body: 'Un administrateur appelle tout le groupe' });
  contextInfo.mentionedJid = participants;
  await sock.sendMessage(from, {
    text: `📣 L’administrateur ${senderNumber ? '@' + senderNumber : ''} appelle tout le monde.`,
    mentions: participants,
    contextInfo,
  }, { quoted: msg });
  return true;
}

module.exports = { getText, applyAutoPresence, hasWhatsAppLink, handleAntiwalink, handleAdminAtAll };
