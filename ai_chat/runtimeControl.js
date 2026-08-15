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

function messageText(msg) {
  const m = unwrap(msg?.message || {});
  return String(m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '').trim();
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

function signedByAnotherExaucee(msg) {
  const text = messageText(msg).replace(/\*+/g, '').trim();
  return /(?:^|\n)\s*>\s*Exauc[eé]e\s*$/i.test(text);
}

function naturalControl(text) {
  const m = String(text || '').trim().match(/^\.?\s*exauc[eé]e\s+(on|off|status|restart)\s*$/i);
  return m ? m[1].toLowerCase() : null;
}

async function sendControlReply(sock, msg, text) {
  const chatId = msg?.key?.remoteJid;
  if (!chatId || !sock) return;
  const payload = { text: `${text}\n\n> Exaucée`, __exaucee: true };
  const opts = chatId.endsWith('@g.us') ? { quoted: msg } : undefined;
  try { await sock.sendMessage(chatId, payload, opts); } catch (_) { await sock.sendMessage(chatId, payload); }
}

async function handleExauceeMessage(args = {}) {
  const sessionId = currentSessionId();
  const { settings } = refreshInstance(sessionId);
  const owner = Boolean(args.actor?.isOwner || args.actor?.isSuperMe || args.msg?.key?.fromMe);
  const control = naturalControl(messageText(args.msg));

  // Les ordres naturels Owner restent accessibles même quand Exaucée est OFF,
  // afin de pouvoir la rallumer sans passer par Render.
  if (control && owner) {
    if (control === 'on') {
      setExauceeSettings({ enabled: true }, sessionId);
      restartExaucee(args.sock, sessionId);
      await sendControlReply(args.sock, args.msg, '🌸 Exaucée est activée.');
      return true;
    }
    if (control === 'off') {
      setExauceeSettings({ enabled: false }, sessionId);
      await sendControlReply(args.sock, args.msg, '🌸 Exaucée est désactivée. Je resterai silencieuse jusqu’à « Exaucée on » ou `.exaucee on`.');
      return true;
    }
    if (control === 'status') {
      const s = loadSettings(sessionId);
      await sendControlReply(args.sock, args.msg, `🌸 Exaucée : ${s.enabled ? 'ON' : 'OFF'} | onlytag=${s.onlyTag ? 'ON' : 'OFF'} | owneronly=${s.ownerOnly ? 'ON' : 'OFF'}`);
      return true;
    }
    if (control === 'restart') {
      const s = loadSettings(sessionId);
      if (!s.enabled) {
        await sendControlReply(args.sock, args.msg, '🌸 Exaucée est OFF. Active-la d’abord avec « Exaucée on ».');
        return true;
      }
      restartExaucee(args.sock, sessionId);
      await sendControlReply(args.sock, args.msg, '♻️ Runtime Exaucée relancé.');
      return true;
    }
  }

  // OFF est absolu : aucune conversation, jeu, mémoire ou action dynamique.
  if (!settings.enabled) return false;

  // Deux instances Exaucée dans le même groupe ne doivent jamais se répondre.
  if (signedByAnotherExaucee(args.msg)) return false;

  const chatId = args.msg?.key?.remoteJid || '';
  const isGroup = chatId.endsWith('@g.us');
  if (isGroup && !settings.groups) return false;
  if (!isGroup && !settings.private) return false;
  if (settings.ownerOnly && !owner) return false;
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

function getExauceeStatus(sessionId = currentSessionId()) { return loadSettings(sessionId); }

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
  explicitlyTagged,
  signedByAnotherExaucee,
  naturalControl
};
