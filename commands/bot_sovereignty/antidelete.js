/**
 * AntiDelete Command - 𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Intercepte les messages supprimés et les renvoie
 * Mode 'private' → renvoi dans le DM de l'owner
 * Mode 'chat'    → renvoi dans le chat d'origine
 *
 * Usage :
 *   .antidelete on [private|chat]  — active avec mode choisi (défaut: private)
 *   .antidelete off                — désactive
 *   .antidelete status             — affiche l'état actuel
 */

const database = require('../../database');
const config   = require('../../config');

const prefix = config.prefix || '.';

// ==========================================
// STORE EN MÉMOIRE DES MESSAGES RÉCENTS
// Conserve les messages pendant 10 minutes
// pour pouvoir les récupérer si supprimés
// ==========================================
const messageCache = new Map();
const CACHE_TTL    = 10 * 60 * 1000; // 10 minutes

/**
 * Stocke un message dans le cache
 * Appelé depuis l'intercepteur dans handler.js
 */
function cacheMessage(msg) {
  if (!msg?.key?.id || !msg.message) return;
  // Ignore les messages du bot lui-même
  if (msg.key.fromMe) return;

  const key = msg.key.id;
  messageCache.set(key, {
    msg,
    cachedAt: Date.now()
  });

  // Auto-nettoyage
  setTimeout(() => messageCache.delete(key), CACHE_TTL);
}

/**
 * Récupère un message du cache par son ID
 */
function getCachedMessage(msgId) {
  return messageCache.get(msgId) || null;
}

/**
 * Retourne le contenu textuel d'un message
 */
function extractBody(message) {
  if (!message) return null;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    null
  );
}

/**
 * Retourne le type de média d'un message
 */
function getMediaType(message) {
  if (!message) return null;
  if (message.imageMessage)    return 'image';
  if (message.videoMessage)    return 'video';
  if (message.audioMessage)    return 'audio';
  if (message.stickerMessage)  return 'sticker';
  if (message.documentMessage) return 'document';
  if (message.voiceMessage)    return 'audio';
  return null;
}

// ==========================================
// COMMANDE ANTIDELETE
// ==========================================
module.exports = {
  name: 'antidelete',
  aliases: ['antidel', 'nodelete', 'fantome'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴀᴘᴛᴜʀᴇ ʟᴇs ᴍᴇssᴀɢᴇs sᴜᴘᴘʀɪᴍᴇ́s',
  usage: `${prefix}antidelete on [private|chat] | off | status`,

  // Exposer les fonctions utilitaires pour handler.js
  cacheMessage,
  getCachedMessage,
  extractBody,
  getMediaType,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isSupremeOwner: isSuperMe, toSmallCaps, from } = extra;
    try {
    if (!isOwner && !isSuperMe) return;

    const isGroup = from.endsWith('@g.us');
    const action  = args[0]?.toLowerCase();
    const modeArg = args[1]?.toLowerCase();

    // ── STATUS ──────────────────────────────────────────────
    if (!action || action === 'status' || action === 'etat') {
      const settings = isGroup
        ? database.getGroupSettings(from)
        : database.getUserSettings?.(from) || {};

      const isActive = settings?.antidelete || false;
      const mode     = settings?.antideleteMode || 'private';
      const modeStr  = mode === 'chat'
        ? `💬 *${toSmallCaps('dans le chat d\'origine')}*`
        : `📩 *${toSmallCaps('dans votre inbox (prive)')}*`;

      return reply(
        `╭━≪• *🕵️ ᴀɴᴛɪᴅᴇʟᴇᴛᴇ* •≫━╾╮\n` +
        `┃ 🔮 *sᴛᴀᴛᴜᴛ* : ${isActive ? '🟢 *ᴀᴄᴛɪᴠᴇ́*' : '🔴 *ᴅᴇ́sᴀᴄᴛɪᴠᴇ́*'}\n` +
        `┃ 📡 *ᴍᴏᴅᴇ* : ${isActive ? modeStr : '—'}\n` +
        `┃ 🏚️ *ᴢᴏɴᴇ* : ${isGroup ? toSmallCaps('groupe') : toSmallCaps('prive')}\n` +
        `┃ 📖 *ᴜsᴀɢᴇ* :\n` +
        `┃ • \`${prefix}antidelete on private\`\n` +
        `┃   ${toSmallCaps('→ renvoi dans votre inbox')}\n` +
        `┃ • \`${prefix}antidelete on chat\`\n` +
        `┃   ${toSmallCaps('→ renvoi dans le chat')}\n` +
        `┃ • \`${prefix}antidelete off\`\n` +
        `┃   ${toSmallCaps('→ desactiver')}\n` +
        `╰━━━━━━━━━━━━━━━━━━╯\n` +
        extra.phrases.footer()
      );
    }

    // ── OFF ──────────────────────────────────────────────────
    if (action === 'off') {
      if (isGroup) {
        database.updateGroupSettings(from, { antidelete: false, antideleteMode: null });
      } else {
        database.updateUser?.(from, { antidelete: false, antideleteMode: null });
      }

      return reply(
        `╭━≪• *👀 ᴀɴᴛɪᴅᴇʟᴇᴛᴇ* •≫━╾╮\n` +
        `┃ 🔴 *${toSmallCaps('fantome desactive')}*\n` +
        `┃ ${toSmallCaps('les suppressions ne seront')}\n` +
        `┃ ${toSmallCaps('plus interceptees.')}\n` +       `╰━━━━━━━━━━━━━━━━━━╯\n` +
        extra.phrases.footer()
      );
    }

    // ── ON ───────────────────────────────────────────────────
    if (action === 'on') {
      // Mode : 'private' (inbox owner) ou 'chat' (chat d'origine)
      const mode = (modeArg === 'chat') ? 'chat' : 'private';

      if (isGroup) {
        database.updateGroupSettings(from, { antidelete: true, antideleteMode: mode });
      } else {
        database.updateUser?.(from, { antidelete: true, antideleteMode: mode });
      }

      const modeDesc = mode === 'chat'
        ? `💬 *${toSmallCaps('chat')}* — ${toSmallCaps('renvoi dans ce chat')}`
        : `📩 *${toSmallCaps('prive')}* — ${toSmallCaps('renvoi dans votre inbox')}`;

      return reply(
        `╭━≪• *🕵️ ᴀɴᴛɪᴅᴇʟᴇᴛᴇ* •≫━╾╮\n` +
        `┃ 🟢 *${toSmallCaps('fantome active')} !*\n` +
        `┃ 📡 *ᴍᴏᴅᴇ* : ${modeDesc}\n` +
        `┃ 🏚️ *ᴢᴏɴᴇ* : ${isGroup ? toSmallCaps('groupe') : toSmallCaps('prive')}\n` +
        `┃ 👁️ *${toSmallCaps('𝐃𝐈𝐏𝐏𝐄𝐑 surveille desormais')}*\n` +
        `┃ *${toSmallCaps('toutes les suppressions.')}*\n` +       `╰━━━━━━━━━━━━━━━━━╯\n` +
        extra.phrases.footer()
      );
    }

    // Argument invalide
    return reply(
      `*〆 ${toSmallCaps('argument invalide')}*\n` +
      `*${toSmallCaps('usage')} : \`${prefix}antidelete on [private|chat]\`*`
    );
    } catch (err) {
      console.error('[antidelete] Erreur execute:', err.message);
      try { await reply(`❌ Erreur interne : ${err.message}`); } catch (_) {}
    }
  }
};
