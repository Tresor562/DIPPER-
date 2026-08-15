'use strict';

const sessionContext = require('../utils/sessionContext');
const runtime = require('./runtime');
const { loadSettings, saveSettings, resetSettings } = require('./settings');

function currentSessionId() {
  return sessionContext.getCurrentSessionId?.() || sessionContext.DEFAULT_SESSION_ID || 'default';
}

function refreshInstance(sessionId) {
  const settings = loadSettings(sessionId);
  const instance = runtime.getInstance(sessionId);
  Object.assign(instance.config, settings);
  return { instance, settings };
}

function unwrap(message = {}) {
  let m = message;
  if (m.ephemeralMessage) m = m.ephemeralMessage.message || {};
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message || {};
  if (m.viewOnceMessage) m = m.viewOnceMessage.message || {};
  return m;
}

function normalizeJid(jid = '') {
  return String(jid).replace(/:\d+(?=@)/, '');
}

function explicitlyTagged(sock, msg) {
  const m = unwrap(msg?.message || {});
  const context = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || m.documentMessage?.contextInfo || {};
  const mentions = context.mentionedJid || [];
  const known = new Set();
  for (const raw of [sock?.user?.id, sock?.user?.lid, sock?.user?.jid]) {
    if (!raw) continue;
    known.add(String(raw));
    known.add(normalizeJid(raw));
    const num = String(raw).split(':')[0].split('@')[0];
    if (num) known.add(`${num}@s.whatsapp.net`);
  }
  return mentions.some(jid => known.has(String(jid)) || known.has(normalizeJid(jid)));
}

async function handleExauceeMessage(args = {}) {
  const sessionId = currentSessionId();
  const { settings } = refreshInstance(sessionId);
  if (!settings.enabled) return false;

  const chatId = args.msg?.key?.remoteJid || '';
  const isGroup = chatId.endsWith('@g.us');
  if (isGroup && !settings.groups) return false;
  if (!isGroup && !settings.private) return false;
  if (settings.ownerOnly && !(args.actor?.isOwner || args.actor?.isSuperMe)) return false;
  if (settings.onlyTag && isGroup && !explicitlyTagged(args.sock, args.msg)) return false;

  return runtime.handleExauceeMessage(args);
}

async function handleExauceeDynamicCommand(args = {}) {
  const sessionId = currentSessionId();
  const { settings } = refreshInstance(sessionId);
  if (!settings.enabled) return false;
  return runtime.handleExauceeDynamicCommand(args);
}

function bootstrapExaucee(args = {}) {
  const sessionId = args.sessionId || currentSessionId();
  const { instance, settings } = refreshInstance(sessionId);
  if (!settings.enabled) {
    instance.scheduler?.stop?.();
    return false;
  }
  return runtime.bootstrapExaucee({ ...args, sessionId });
}

function getExauceeStatus(sessionId = currentSessionId()) {
  return loadSettings(sessionId);
}

function setExauceeSettings(patch, sessionId = currentSessionId()) {
  const settings = saveSettings(sessionId, patch);
  const instance = runtime.getInstance(sessionId);
  Object.assign(instance.config, settings);
  if (!settings.enabled) instance.scheduler?.stop?.();
  return settings;
}

function resetExauceeSettings(sessionId = currentSessionId()) {
  const settings = resetSettings(sessionId);
  const instance = runtime.getInstance(sessionId);
  Object.assign(instance.config, settings);
  return settings;
}

function restartExaucee(sock, sessionId = currentSessionId()) {
  const { instance, settings } = refreshInstance(sessionId);
  instance.scheduler?.stop?.();
  if (settings.enabled && sock) runtime.ensureScheduler(instance, sock);
  return settings;
}

module.exports = {
  handleExauceeMessage,
  handleExauceeDynamicCommand,
  bootstrapExaucee,
  getExauceeStatus,
  setExauceeSettings,
  resetExauceeSettings,
  restartExaucee,
  explicitlyTagged
};
