/**
 * custommenu / customreply / customwelcome / groupdashboard — THE BIG DIPPER
 */
'use strict';

const fs       = require('fs');
const path     = require('path');
const database = require('../../database');
const config   = require('../../config');
const sessionContext = require('../../utils/sessionContext');

const prefix   = config.prefix || '.';
const LEGACY_DATA_DIR = path.join(process.cwd(), 'data');

// [PHASE 2] Isolation par session : avant, custom_replies.json et
// custom_menus.json étaient deux fichiers uniques sous data/, partagés
// par TOUTES les sessions — les réponses automatiques et menus
// personnalisés d'un groupe/utilisateur d'une session étaient visibles
// (et déclenchables) depuis n'importe quelle autre session. Réutilise
// database/sessions/<sessionId>/ (même dossier que database.js).
function sessionDataDir() {
  const dir = path.join(process.cwd(), 'database', 'sessions', sessionContext.getCurrentSessionId());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let _legacyCustomMigrationDone = false;
function migrateLegacyCustomOnce() {
  if (_legacyCustomMigrationDone) return;
  _legacyCustomMigrationDone = true;
  try {
    if (sessionContext.getCurrentSessionId() !== sessionContext.DEFAULT_SESSION_ID) return;
    const dir = sessionDataDir();
    const pairs = [
      [path.join(LEGACY_DATA_DIR, 'custom_replies.json'), path.join(dir, 'custom_replies.json')],
      [path.join(LEGACY_DATA_DIR, 'custom_menus.json'),   path.join(dir, 'custom_menus.json')],
    ];
    for (const [legacy, target] of pairs) {
      if (fs.existsSync(legacy) && !fs.existsSync(target)) fs.copyFileSync(legacy, target);
    }
  } catch (err) {
    console.error('[custommenu] migration échouée:', err.message);
  }
}

function customReplyPath() { migrateLegacyCustomOnce(); return path.join(sessionDataDir(), 'custom_replies.json'); }
function customMenuPath()  { migrateLegacyCustomOnce(); return path.join(sessionDataDir(), 'custom_menus.json'); }

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

function loadJSON(p) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}; }
  catch { return {}; }
}
function saveJSON(p, data) {
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8'); } catch (_) {}
}


module.exports = [

  // ── .custommenu ───────────────────────────────────────────────
  {
    name    : 'custommenu',
    aliases : ['menupersonnalise', 'setmenu', 'menuconfig'],
    category: '⚙️ Gestion de groupe',
    description: '『 THE BIG DIPPER 』➪ ᴘᴇʀsᴏɴɴᴀʟɪsᴇʀ ᴠᴏᴛʀᴇ ᴍᴇɴᴜ',
    usage   : `${prefix}custommenu set | reset | view`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, sender, phrases } = extra;

      const sub  = (args[0] || '').toLowerCase();
      const menus = loadJSON(customMenuPath());
      const num   = sender.split('@')[0].split(':')[0];

      if (sub === 'reset') {
        delete menus[num];
        saveJSON(customMenuPath(), menus);
        return reply(`*✅ ${toSC('menu personnalise reinitialise')}*\n\n${phrases.footer()}`);
      }

      if (sub === 'view') {
        const m = menus[num];
        if (!m) return reply(`*📋 ${toSC('aucun menu personnalise configure')}*\n_${toSC('utilisez')} \`${prefix}custommenu set [style 0-20]\`_\n\n${phrases.footer()}`);
        // ⚠️ m.style peut valoir 0 (Style DIPPER) : ne pas utiliser `||`,
        // sinon 0 est affiché comme absent et remplacé par 1.
        const displayStyle = (m.style !== undefined && m.style !== null) ? m.style : 0;
        return reply(
          `╭━≪• *🎨 ${toSC('votre menu')}* •≫━╮\n` +
          `┃ 🖼️ *${toSC('style')}* : ${displayStyle}\n` +
          `┃ 🏷️ *${toSC('titre')}* : ${m.title || toSC('defaut')}\n` +
          `┃ 🖼️ *${toSC('image')}* : ${m.imageUrl ? '✅' : '❌'}\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      // set [style] [title] [imageUrl]
      // ⚠️ parseInt(args[1]) peut valoir 0 (Style DIPPER) : ne pas utiliser
      // `|| 1`, sinon il devient impossible de choisir le Style 0 ici.
      const parsedStyle = parseInt(args[1]);
      const styleNum = Number.isNaN(parsedStyle) ? 0 : parsedStyle;
      const title    = args[2] || '';
      const imageUrl = args[3] || '';

      if (styleNum < 0 || styleNum > 20) {
        return reply(`*❌ ${toSC('style invalide')}. ${toSC('choisissez entre 0 et 20')}.*\n\n${phrases.footer()}`);
      }

      menus[num] = { style: styleNum, title, imageUrl, updatedAt: Date.now() };
      saveJSON(customMenuPath(), menus);

      return reply(
        `╭━≪• *✅ ${toSC('menu configure')}* •≫━╮\n` +
        `┃ 🎨 *${toSC('style')}* : ${styleNum}\n` +
        `┃ 🏷️ *${toSC('titre')}* : ${title || toSC('defaut')}\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .customreply ──────────────────────────────────────────────
  {
    name    : 'customreply',
    aliases : ['reponsauto', 'autoreply', 'setautoreply', 'reponseperso'],
    category: '⚙️ Gestion de groupe',
    description: '『 THE BIG DIPPER 』➪ ʀᴇ́ᴘᴏɴsᴇs ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇs ᴘᴇʀsᴏɴɴᴀʟɪsᴇ́ᴇs',
    usage   : `${prefix}customreply add [mot] | [réponse] — ou — remove [mot] — ou — list`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, sender, from, phrases } = extra;

      const sub  = (args[0] || '').toLowerCase();
      const key  = from; // par groupe/DM
      const data = loadJSON(customReplyPath());
      if (!data[key]) data[key] = {};

      if (sub === 'list') {
        const entries = Object.entries(data[key]);
        if (entries.length === 0) return reply(`*📋 ${toSC('aucune reponse automatique configuree')}*\n\n${phrases.footer()}`);
        const lines = entries.map(([mot, rep]) => `┃ 🔑 *${mot}* → ${rep.slice(0, 40)}...`).join('\n');
        return reply(`╭━≪• *📋 ${toSC('reponses auto')}* •≫━╮\n${lines}\n╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`);
      }

      if (sub === 'remove') {
        const mot = args[1]?.toLowerCase();
        if (!mot) return reply(`*❌ ${toSC('precisez le mot a supprimer')}*\n\n${phrases.footer()}`);
        delete data[key][mot];
        saveJSON(customReplyPath(), data);
        return reply(`*✅ ${toSC('reponse supprimee pour')}* : *${mot}*\n\n${phrases.footer()}`);
      }

      // add [mot] | [réponse]
      const full = args.slice(1).join(' ');
      const sep  = full.indexOf('|');
      if (sep === -1) return reply(`*📋 ${toSC('usage')}* : \`${prefix}customreply add bonjour | Bonjour ! Comment puis-je vous aider ?\`\n\n${phrases.footer()}`);

      const mot = full.slice(0, sep).trim().toLowerCase();
      const rep = full.slice(sep + 1).trim();
      if (!mot || !rep) return reply(`*❌ ${toSC('mot et reponse requis')}*\n\n${phrases.footer()}`);

      data[key][mot] = rep;
      saveJSON(customReplyPath(), data);
      return reply(
        `╭━≪• *✅ ${toSC('reponse ajoutee')}* •≫━╮\n` +
        `┃ 🔑 *${toSC('mot')}* : ${mot}\n` +
        `┃ 💬 *${toSC('reponse')}* : ${rep.slice(0, 60)}\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .customwelcome ────────────────────────────────────────────
  {
    name    : 'customwelcome',
    aliases : ['welcomeperso', 'setwelcomeperso'],
    category: '⚙️ Gestion de groupe',
    description: '『 THE BIG DIPPER 』➪ ᴍᴇssᴀɢᴇs ᴅ\'ᴀᴄᴄᴜᴇɪʟ ᴘᴇʀsᴏɴɴᴀʟɪsᴇ́s',
    usage   : `${prefix}customwelcome [welcome|goodbye|promote|demote] [message]`,
    groupOnly: true, adminOnly: true, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, phrases } = extra;

      const TYPES = ['welcome', 'goodbye', 'promote', 'demote'];
      const type  = (args[0] || '').toLowerCase();

      if (!TYPES.includes(type)) {
        return reply(
          `*📋 ${toSC('types disponibles')}* : ${TYPES.join(', ')}\n\n` +
          `*${toSC('variables disponibles')}* :\n` +
          `┃ *{nom}* → ${toSC('prenom du membre')}\n` +
          `┃ *{numero}* → ${toSC('numero du membre')}\n` +
          `┃ *{groupe}* → ${toSC('nom du groupe')}\n` +
          `┃ *{total}* → ${toSC('nombre de membres')}\n\n` +
          `${phrases.footer()}`
        );
      }

      const message = args.slice(1).join(' ');
      if (!message) {
        return reply(`*❌ ${toSC('precisez le message personnalise')}*\n\n${phrases.footer()}`);
      }

      const settings = database.getGroupSettings(from);
      if (!settings.customMessages) settings.customMessages = {};
      settings.customMessages[type] = message;
      database.updateGroupSettings(from, { customMessages: settings.customMessages });

      return reply(
        `╭━≪• *✅ ${toSC('message configure')}* •≫━╮\n` +
        `┃ 📌 *${toSC('type')}* : ${type}\n` +
        `┃ 💬 *${toSC('message')}* : ${message.slice(0, 80)}\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },

  // ── .groupdashboard ───────────────────────────────────────────
  {
    name    : 'groupdashboard',
    aliases : ['dashboard', 'gcdash', 'groupboard'],
    category: '⚙️ Gestion de groupe',
    description: '『 THE BIG DIPPER 』➪ ᴛᴀʙʟᴇᴀᴜ ᴅᴇ ʙᴏʀᴅ ᴄᴏᴍᴘʟᴇᴛ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage   : `${prefix}groupdashboard`,
    groupOnly: true, adminOnly: true, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, phrases } = extra;

      let meta;
      try { meta = await sock.groupMetadata(from); }
      catch { return reply(`*❌ ${toSC('erreur lecture groupe')}*`); }

      const settings = database.getGroupSettings(from);
      const admins   = meta.participants.filter(p => p.admin).length;

      const protections = [
        ['antilink',    settings.antilink],
        ['antispam',    settings.antispam],
        ['antidelete',  settings.antidelete],
        ['antibot',     settings.antibot],
        ['antiraid',    settings.antiraid],
        ['aiModerator', settings.aiModerator],
      ].map(([name, val]) => `┃ ${val ? '✅' : '❌'} *${name}*`).join('\n');

      return reply(
        `╭━≪• *📊 DASHBOARD — ${meta.subject}* •≫━╮\n` +
        `┃\n` +
        `┃ 👥 *${toSC('membres')}* : ${meta.participants.length}\n` +
        `┃ 👑 *${toSC('admins')}* : ${admins}\n` +
        `┃ 📢 *${toSC('annonces')}* : ${meta.announce ? '✅' : '❌'}\n` +
        `┃ 🔒 *${toSC('restriction')}* : ${meta.restrict ? '✅' : '❌'}\n` +
        `┃\n` +
        `┃ 🛡️ *${toSC('protections')}* :\n` +
        `${protections}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    },
  },
];

// Export pour handler.js — lecture des custom replies
module.exports.getCustomReplies = (groupId) => {
  const data = loadJSON(customReplyPath());
  return data[groupId] || {};
};

// Export pour menu.js — lecture du menu personnalisé d'un utilisateur
// (clé = numéro de l'expéditeur, PAS le groupe : réglage personnel,
// applicable partout où cet utilisateur invoque .menu)
module.exports.getCustomMenuConfig = (senderJid) => {
  if (!senderJid) return null;
  const num   = senderJid.split('@')[0].split(':')[0];
  const menus = loadJSON(customMenuPath());
  return menus[num] || null;
};

// Export pour handler.js — message personnalisé pour un événement de groupe
// (welcome/goodbye/promote/demote), avec substitution des variables.
// Retourne null si aucun message personnalisé n'est configuré pour ce type
// (le générique doit alors s'appliquer).
module.exports.getCustomEventMessage = (groupId, type, vars = {}) => {
  const settings = database.getGroupSettings(groupId);
  const template = settings.customMessages && settings.customMessages[type];
  if (!template) return null;
  return template
    .replace(/\{nom\}/g, vars.nom != null ? String(vars.nom) : '')
    .replace(/\{numero\}/g, vars.numero != null ? String(vars.numero) : '')
    .replace(/\{groupe\}/g, vars.groupe != null ? String(vars.groupe) : '')
    .replace(/\{total\}/g, vars.total != null ? String(vars.total) : '');
};
