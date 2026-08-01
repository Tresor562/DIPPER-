/**
 * setkickallname / setkickallimage / setkickalltext / setkickalldelay — 𝐃𝐚𝐫𝐤
 * Configuration avancée du kickall.
 * Tier : Owner / Admin
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const axios  = require('axios');
const config = require('../../config');
const sessionContext = require('../../utils/sessionContext');

const prefix   = config.prefix || '.';
// [PHASE 2] Isolation par session : avant, un seul data/kickall_config.json
// partagé par TOUTES les sessions (config de nom/image/texte/délai post-kickall
// d'un groupe visible/modifiable depuis n'importe quelle autre session).
let _legacyKickallCfgMigrationDone = false;
function CFG_PATH() {
  const dir = path.join(process.cwd(), 'database', 'sessions', sessionContext.getCurrentSessionId());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'kickall_config.json');
  if (!_legacyKickallCfgMigrationDone) {
    _legacyKickallCfgMigrationDone = true;
    try {
      const legacy = path.join(process.cwd(), 'data', 'kickall_config.json');
      if (sessionContext.getCurrentSessionId() === sessionContext.DEFAULT_SESSION_ID && fs.existsSync(legacy) && !fs.existsSync(target)) {
        fs.copyFileSync(legacy, target);
      }
    } catch (_) {}
  }
  return target;
}

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

function loadCfg() {
  try { return fs.existsSync(CFG_PATH()) ? JSON.parse(fs.readFileSync(CFG_PATH(), 'utf8')) : {}; }
  catch { return {}; }
}
function saveCfg(data) {
  try {
    const dir = path.dirname(CFG_PATH());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CFG_PATH(), JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

function getGroupCfg(groupId) {
  const data = loadCfg();
  return data[groupId] || {};
}
function setGroupCfg(groupId, updates) {
  const data = loadCfg();
  data[groupId] = { ...(data[groupId] || {}), ...updates };
  saveCfg(data);
}

const VALID_DELAYS = [5, 10, 30, 60];

module.exports = [

  // ── .setkickallname ───────────────────────────────────────────
  {
    name    : 'setkickallname',
    aliases : ['kickallname', 'setkanome'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ʟᴇ ɴᴏᴍ ᴅᴜ ɢʀᴏᴜᴘᴇ ᴀᴘʀᴇ̀s ʟᴇ ᴋɪᴄᴋᴀʟʟ',
    usage   : `${prefix}setkickallname [nouveau nom]`,
    groupOnly: true, adminOnly: true, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, isOwner, isAdmin, phrases } = extra;

      if (!isOwner && !isAdmin) {
        return reply(`*⛔ ${toSC('admin ou owner requis')}*\n\n${phrases.footer()}`);
      }

      const name = args.join(' ').trim();
      if (!name) {
        return reply(`*📋 Usage* : \`${prefix}setkickallname [nouveau nom]\`\n\n${phrases.footer()}`);
      }

      setGroupCfg(from, { newName: name });

      return reply(
        `╭━≪• *✅ ${toSC('nom configure')}* •≫━╮\n` +
        `┃ 📛 *${toSC('nouveau nom')}* : ${name}\n` +
        `┃ _${toSC('sera applique lors du prochain kickall')}_\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .setkickallimage ──────────────────────────────────────────
  {
    name    : 'setkickallimage',
    aliases : ['kickallimage', 'setkaimage'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ʟᴀ ᴘʜᴏᴛᴏ ᴅᴜ ɢʀᴏᴜᴘᴇ ᴀᴘʀᴇ̀s ʟᴇ ᴋɪᴄᴋᴀʟʟ',
    usage   : `${prefix}setkickallimage [url] — ou répondre à une image`,
    groupOnly: true, adminOnly: true, botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, from, isOwner, isAdmin, phrases } = extra;

      if (!isOwner && !isAdmin) {
        return reply(`*⛔ ${toSC('admin ou owner requis')}*\n\n${phrases.footer()}`);
      }

      // Vérifier si c'est une réponse à une image
      const ctx     = msg.message?.extendedTextMessage?.contextInfo;
      const quoted  = ctx?.quotedMessage;
      let imageBase64 = null;

      if (quoted?.imageMessage) {
        try {
          const { downloadMediaMessage } = require('@whiskeysockets/baileys');
          // [FIX AUDIT] Même construction de clé que setmenuimage.js (pattern
          // éprouvé) : remoteJid/id/participant explicites, PAS un spread de
          // contextInfo (qui n'a pas de champ `id`, seulement `stanzaId` —
          // downloadMediaMessage a besoin de `id`). reuploadRequest ajouté
          // aussi : sans lui, le téléchargement échoue silencieusement si
          // le média doit être re-demandé à WhatsApp (cas fréquent).
          const fakeMsg = {
            key: {
              remoteJid  : from,
              id         : ctx.stanzaId,
              participant: ctx.participant,
            },
            message: quoted,
          };
          const buf = await downloadMediaMessage(fakeMsg, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage,
          });
          imageBase64 = buf.toString('base64');
        } catch (_) {}
      }

      // Sinon URL
      const url = args[0];
      if (!imageBase64 && url) {
        try {
          const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
          imageBase64 = Buffer.from(resp.data).toString('base64');
        } catch {
          return reply(`*❌ ${toSC('impossible de telecharger l image')}*\n\n${phrases.footer()}`);
        }
      }

      if (!imageBase64) {
        return reply(
          `*📋 Usage* : \`${prefix}setkickallimage [url]\`\n` +
          `_ou répondez à une image avec \`${prefix}setkickallimage\`_\n\n${phrases.footer()}`
        );
      }

      setGroupCfg(from, { newImageBase64: imageBase64 });

      return reply(
        `╭━≪• *✅ ${toSC('image configuree')}* •≫━╮\n` +
        `┃ 🖼️ _${toSC('image sauvegardee avec succes')}_\n` +
        `┃ _${toSC('sera appliquee lors du prochain kickall')}_\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .setkickalltext ───────────────────────────────────────────
  {
    name    : 'setkickalltext',
    aliases : ['kickalltext', 'setkatext', 'kickallmessage'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ʟᴇ ᴍᴇssᴀɢᴇ ᴇɴᴠᴏʏᴇ́ ᴀᴠᴀɴᴛ ʟᴇ ᴋɪᴄᴋᴀʟʟ',
    usage   : `${prefix}setkickalltext [message]`,
    groupOnly: true, adminOnly: true, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, isOwner, isAdmin, phrases } = extra;

      if (!isOwner && !isAdmin) {
        return reply(`*⛔ ${toSC('admin ou owner requis')}*\n\n${phrases.footer()}`);
      }

      const text = args.join(' ').trim();
      if (!text) {
        return reply(`*📋 Usage* : \`${prefix}setkickalltext [message]\`\n\n${phrases.footer()}`);
      }

      setGroupCfg(from, { warningText: text });

      return reply(
        `╭━≪• *✅ ${toSC('message configure')}* •≫━╮\n` +
        `┃ 💬 ${text.slice(0, 100)}\n` +
        `┃ _${toSC('sera envoye avant le kickall')}_\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .setkickalldelay ──────────────────────────────────────────
  {
    name    : 'setkickalldelay',
    aliases : ['kickalldelay', 'setkatimer', 'kickalldelai'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ʟᴇ ᴅᴇ́ʟᴀɪ ᴀᴠᴀɴᴛ ʟ\'ᴇxᴘᴜʟsɪᴏɴ',
    usage   : `${prefix}setkickalldelay [5|10|30|60|valeur]`,
    groupOnly: true, adminOnly: true, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, isOwner, isAdmin, phrases } = extra;

      if (!isOwner && !isAdmin) {
        return reply(`*⛔ ${toSC('admin ou owner requis')}*\n\n${phrases.footer()}`);
      }

      const seconds = parseInt(args[0]);
      // [FIX AUDIT] kickall.js applique un plancher strict de 3s
      // (Math.max(3, ...)), quelle que soit la valeur enregistrée ici.
      // Accepter 1 ou 2s ici mentirait à l'utilisateur : la valeur serait
      // silencieusement relevée à 3 au moment du kickall, sans le prévenir.
      if (!seconds || seconds < 3 || seconds > 300) {
        return reply(
          `*📋 Usage* : \`${prefix}setkickalldelay [secondes]\`\n\n` +
          `*${toSC('valeurs predefinies')}* : ${VALID_DELAYS.join('s, ')}s\n` +
          `*${toSC('valeur personnalisee')}* : 3-300s\n\n${phrases.footer()}`
        );
      }

      setGroupCfg(from, { delay: seconds });

      return reply(
        `╭━≪• *✅ ${toSC('delai configure')}* •≫━╮\n` +
        `┃ ⏱️ *${toSC('delai')}* : ${seconds} ${toSC('secondes')}\n` +
        `┃ _${toSC('applique avant chaque kickall')}_\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },
];

// Export pour kickall.js
module.exports.getGroupCfg = getGroupCfg;
