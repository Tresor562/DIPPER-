/**
 * Protection Commands - 𝐃𝐚𝐫𝐤 Edition
 * .antibadword   → filtre insultes / gros mots
 * .antibot       → bloque les bots
 * .antidemote    → protège les admins contre les rétrogradations
 * .antiforeign   → bloque les numéros étrangers
 * .antiforward   → bloque les messages transférés
 * .antimessage   → filtre les messages suspects (trop longs, caps, spam)
 * .antisticker   → bloque les stickers
 * .antitagadmin  → protège les admins contre les tags abusifs
 *
 * Architecture :
 *  - Chaque commande toggle on/off le flag dans la DB du groupe
 *  - Le handler.js lit ces flags et appelle les fonctions handleAntiXxx
 *  - Toutes les fonctions handleAntiXxx sont exportées en bas de ce fichier
 *    pour être importées dans handler.js
 */

const database = require('../../database');
const config   = require('../../config.js');
const { isAllowedUser } = require('../../utils/jidHelpers');
const modlog   = require('../../utils/modlog');
const prefix   = config.prefix || '.';

// ── Utilitaires ────────────────────────────────────────────────────────────
function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// Récupère le JID du bot
function getBotJid(sock) {
  return (sock.user?.id || '').split(':')[0] + '@s.whatsapp.net';
}

// Vérifie si un JID est admin
function isAdminJid(participants, jid) {
  const clean = jid.split('@')[0].split(':')[0];
  return participants.some(p =>
    (p.id?.split('@')[0].split(':')[0] === clean) &&
    (p.admin === 'admin' || p.admin === 'superadmin')
  );
}

// ── Génère une commande protection toggle générique ─────────────────────────
function makeProtectionCmd({ name, aliases, description, dbKey, label, icon, examples = [] }) {
  return {
    name,
    aliases,
    category: '🛡️ Protections',
    description,
    usage: `${prefix}${name} on/off`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from, sender, groupMetadata } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        const settings = database.getGroupSettings(from);

        // Afficher l'état si pas d'argument
        if (!args[0]) {
          const state = settings[dbKey] ? '🟢 ᴏɴ' : '🔴 ᴏꜰꜰ';
          const action = settings[`${dbKey}Action`] ? ` (${settings[`${dbKey}Action`].toUpperCase()})` : '';
          return reply(
            `*╭━≪• ${icon} ${toSC(label)} •≫╾╮*\n` +
            `*┃* 📊 ${toSC('etat')} : ${state}${action}\n` +
            `*┃*\n` +
            `*┃* 🔮 ${toSC('usage')} :\n` +
            `*┃*   \`${prefix}${name} on\`\n` +
            `*┃*   \`${prefix}${name} off\`\n` +
            (examples.length ? `*┃*   ${examples.map(e => `\`${e}\``).join('  ')}\n` : '') +
            `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
          );
        }

        const opt = args[0].toLowerCase();

        if (opt === 'on') {
          if (settings[dbKey]) {
            return reply(`*⚠️ ${toSC(label + ' est deja actif')} !*\n\n${extra.phrases.footer()}`);
          }
          database.updateGroupSettings(from, { [dbKey]: true });
          modlog.addEntry(from, 'setting', {
            by: sender || msg.key.participant || msg.key.remoteJid,
            reason: `${name} ON`,
            groupName: groupMetadata?.subject,
          });
          return reply(
            `*╭━≪• ${icon} ${toSC(label)} •≫╾╮*\n` +
            `*┃* ✅ ${toSC('bouclier active')} (ᴏɴ)\n` +
            `*┃* 🌑 ${toSC('le sanctuaire est protege')}\n` +
            `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
          );
        }

        if (opt === 'off') {
          database.updateGroupSettings(from, { [dbKey]: false });
          modlog.addEntry(from, 'setting', {
            by: sender || msg.key.participant || msg.key.remoteJid,
            reason: `${name} OFF`,
            groupName: groupMetadata?.subject,
          });
          return reply(
            `*╭━≪• ${icon} ${toSC(label)} •≫╾╮*\n` +
            `*┃* 🔓 ${toSC('bouclier desactive')} (ᴏꜰꜰ)\n` +
            `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
          );
        }

        // Option "set action" pour certains (kick/delete/warn)
        if (opt === 'set' && args[1]) {
          const action = args[1].toLowerCase();
          if (!['delete', 'kick', 'warn'].includes(action)) {
            return reply(`*❌ ${toSC('action invalide. choisir')} : delete | kick | warn*\n\n${extra.phrases.footer()}`);
          }
          database.updateGroupSettings(from, { [`${dbKey}Action`]: action });
          modlog.addEntry(from, 'setting', {
            by: sender || msg.key.participant || msg.key.remoteJid,
            reason: `${name} action → ${action.toUpperCase()}`,
            groupName: groupMetadata?.subject,
          });
          return reply(`*✅ ${toSC('action definie a')} : ${action.toUpperCase()}*\n\n${extra.phrases.footer()}`);
        }

        return reply(`*❓ ${toSC('argument invalide. utilise on ou off')}*\n\n${extra.phrases.footer()}`);

      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  };
}

// ── LISTE DES COMMANDES DE PROTECTION ─────────────────────────────────────
const protectionCommands = [

  makeProtectionCmd({
    name: 'antibadword',
    aliases: ['antiinsulte', 'antimots', 'badword'],
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ꜰɪʟᴛʀᴇ ʟᴇs ɪɴsᴜʟᴛᴇs ᴇᴛ ɢʀᴏs ᴍᴏᴛs',
    dbKey: 'antibadword',
    label: 'antibadword',
    icon: '🤬',
    examples: [`${prefix}antibadword set delete`, `${prefix}antibadword set kick`],
  }),

  makeProtectionCmd({
    name: 'antibot',
    aliases: ['blockbots', 'antirobots'],
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʙʟᴏǫᴜᴇ ʟᴇs ʙᴏᴛs ᴅᴀɴs ʟᴇ ɢʀᴏᴜᴘᴇ',
    dbKey: 'antibot',
    label: 'antibot',
    icon: '🤖',
  }),

  makeProtectionCmd({
    name: 'antidemote',
    aliases: ['protectadmin', 'antidemotion'],
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘʀᴏᴛᴇ̀ɢᴇ ʟᴇs ᴀᴅᴍɪɴs ᴄᴏɴᴛʀᴇ ʟᴇs ʀᴇ́ᴛʀᴏɢʀᴀᴅᴀᴛɪᴏɴs',
    dbKey: 'antidemote',
    label: 'antidemote',
    icon: '🛡️',
  }),

  makeProtectionCmd({
    name: 'antiforeign',
    aliases: ['antietranger', 'blocketranger'],
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʙʟᴏǫᴜᴇ ʟᴇs ɴᴜᴍᴇ́ʀᴏs ᴇ́ᴛʀᴀɴɢᴇʀs',
    dbKey: 'antiforeign',
    label: 'antiforeign',
    icon: '🌍',
    examples: [`${prefix}antiforeign set 229`],
  }),

  makeProtectionCmd({
    name: 'antiforward',
    aliases: ['antitransfert', 'noforward'],
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʙʟᴏǫᴜᴇ ʟᴇs ᴍᴇssᴀɢᴇs ᴛʀᴀɴsꜰᴇ́ʀᴇ́s',
    dbKey: 'antiforward',
    label: 'antiforward',
    icon: '↩️',
  }),

  makeProtectionCmd({
    name: 'antimessage',
    aliases: ['antispamtext', 'antiflooding'],
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ꜰɪʟᴛʀᴇ ʟᴇs ᴍᴇssᴀɢᴇs sᴜsᴘᴇᴄᴛs (ᴛʀᴏᴘ ʟᴏɴɢs / ᴄᴀᴘs)',
    dbKey: 'antimessage',
    label: 'antimessage',
    icon: '📵',
  }),

  makeProtectionCmd({
    name: 'antisticker',
    aliases: ['nosticker', 'blocksticker'],
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʙʟᴏǫᴜᴇ ʟᴇs sᴛɪᴄᴋᴇʀs',
    dbKey: 'antisticker',
    label: 'antisticker',
    icon: '🚫',
  }),

  makeProtectionCmd({
    name: 'antitagadmin',
    aliases: ['protectadmintag', 'noadmintag'],
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘʀᴏᴛᴇ̀ɢᴇ ʟᴇs ᴀᴅᴍɪɴs ᴄᴏɴᴛʀᴇ ʟᴇs ᴛᴀɢs ᴀʙᴜsɪꜰs',
    dbKey: 'antitagadmin',
    label: 'antitagadmin',
    icon: '🔕',
  }),

];

// ══════════════════════════════════════════════════════════════════════════════
// HANDLERS — fonctions de protection appelées par handler.js
// Importation dans handler.js :
//   const { handleAntibadword, handleAntibot, ... } = require('./commands/group_management/protections');
// ══════════════════════════════════════════════════════════════════════════════

// ── Liste de mots interdits (personnalisable) ──────────────────────────────
const BAD_WORDS = [
  'putain', 'merde', 'connard', 'salope', 'fdp', 'enculé', 'encule',
  'batard', 'bâtard', 'idiot', 'imbécile', 'imbecile', 'con', 'conne',
  'nique', 'ntm', 'pute', 'pd', 'tg', 'ta gueule', 'ferme ta gueule',
  'fils de pute', 'va te faire', 'baise', 'bordel', 'chier',
];

async function handleAntibadword(sock, msg, groupMetadata) {
  try {
    const settings = database.getGroupSettings(msg.key.remoteJid);
    if (!settings?.antibadword) return;

    const text = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption || ''
    ).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const found = BAD_WORDS.some(w => text.includes(w));
    if (!found) return;

    const sender    = msg.key.participant || msg.key.remoteJid;
    const participants = groupMetadata?.participants || [];
    if (isAdminJid(participants, sender)) return; // Pas de sanction pour les admins
    if (isAllowedUser(sender, settings)) return; // Liste blanche (.allow)

    const action = settings.antibadwordAction || 'delete';
    try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); } catch (_) {}

    if (action === 'kick') {
      try { await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], 'remove'); } catch (_) {}
    }

    await sock.sendMessage(msg.key.remoteJid, {
      text: `*🤬 ᴍᴏᴛ ɪɴᴛᴇʀᴅɪᴛ ᴅᴇ́ᴛᴇᴄᴛᴇ́*\n` +
            `*┃* 👤 @${sender.split('@')[0]}\n` +
            `*┃* ⚖️ sᴀɴᴄᴛɪᴏɴ : ${action.toUpperCase()}\n` +
            `*┃* 🌑 ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ ᴇxɪɢᴇ ʟᴇ ʀᴇsᴘᴇᴄᴛ`,
      mentions: [sender],
    });
  } catch (_) {}
}

async function handleAntibot(sock, msg, groupMetadata) {
  try {
    const settings = database.getGroupSettings(msg.key.remoteJid);
    if (!settings?.antibot) return;

    const sender = msg.key.participant || msg.key.remoteJid;
    const botJid = getBotJid(sock);

    // Détecter si l'expéditeur est un bot (JID se terminant en @s.whatsapp.net mais avec préfixe bot connu)
    // Heuristique : messages fromMe = bot lui-même, les autres bots ont souvent des patterns spécifiques
    const isBotMsg = msg.key.fromMe === false &&
      (sender.includes(':') || // Multi-device format souvent utilisé par les bots
       msg.message?.protocolMessage || // Message système
       false);

    if (!isBotMsg) return;
    if (sender === botJid) return;

    const participants = groupMetadata?.participants || [];
    if (isAdminJid(participants, sender)) return;
    if (isAllowedUser(sender, settings)) return; // Liste blanche (.allow)

    try { await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], 'remove'); } catch (_) {}
    await sock.sendMessage(msg.key.remoteJid, {
      text: `*🤖 ʙᴏᴛ ᴅᴇ́ᴛᴇᴄᴛᴇ́ ᴇᴛ ᴇxᴘᴜʟsᴇ́*\n*┃* 👤 @${sender.split('@')[0]}`,
      mentions: [sender],
    });
  } catch (_) {}
}

async function handleAntidemote(sock, update, groupMetadata) {
  try {
    if (!update?.id) return;
    const settings = database.getGroupSettings(update.id);
    if (!settings?.antidemote) return;
    if (update.action !== 'demote') return;

    // Re-promouvoir les participants rétrogradés
    const promoted = update.participants || [];
    if (promoted.length === 0) return;

    await sock.groupParticipantsUpdate(update.id, promoted, 'promote');
    await sock.sendMessage(update.id, {
      text: `*🛡️ ᴀɴᴛɪᴅᴇᴍᴏᴛᴇ ᴀᴄᴛɪᴠᴇ́*\n*┃* ʀᴇ́ᴛʀᴏɢʀᴀᴅᴀᴛɪᴏɴ ᴀɴɴᴜʟᴇ́ᴇ ❌`,
    });
  } catch (_) {}
}

async function handleAntiforeign(sock, msg, groupMetadata) {
  try {
    const settings = database.getGroupSettings(msg.key.remoteJid);
    if (!settings?.antiforeign) return;

    const sender    = msg.key.participant || msg.key.remoteJid;
    const num       = sender.split('@')[0].split(':')[0];
    // Préfixe autorisé (configurable, défaut : '229' pour Bénin)
    const allowedPrefix = settings.antiforeign_prefix || '229';

    if (num.startsWith(allowedPrefix)) return;

    const participants = groupMetadata?.participants || [];
    if (isAdminJid(participants, sender)) return;
    if (isAllowedUser(sender, settings)) return; // Liste blanche (.allow)

    try { await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], 'remove'); } catch (_) {}
    await sock.sendMessage(msg.key.remoteJid, {
      text: `*🌍 ɴᴜᴍᴇ́ʀᴏ ᴇ́ᴛʀᴀɴɢᴇʀ ᴇxᴘᴜʟsᴇ́*\n*┃* 👤 @${num}\n*┃* 📵 ᴘʀᴇ́ꜰɪxᴇ ᴀᴜᴛᴏʀɪsᴇ́ : +${allowedPrefix}`,
      mentions: [sender],
    });
  } catch (_) {}
}

async function handleAntiforward(sock, msg, groupMetadata) {
  try {
    const settings = database.getGroupSettings(msg.key.remoteJid);
    if (!settings?.antiforward) return;

    // Baileys marque les messages transférés avec forwardingScore > 0
    const anyMsg = msg.message;
    const isForwarded = Object.values(anyMsg || {}).some(m =>
      m?.contextInfo?.forwardingScore > 0 || m?.contextInfo?.isForwarded
    );
    if (!isForwarded) return;

    const sender    = msg.key.participant || msg.key.remoteJid;
    const participants = groupMetadata?.participants || [];
    if (isAdminJid(participants, sender)) return;
    if (isAllowedUser(sender, settings)) return; // Liste blanche (.allow)

    const action = settings.antiforwardAction || 'delete';
    try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); } catch (_) {}
    if (action === 'kick') {
      try { await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], 'remove'); } catch (_) {}
    }
    await sock.sendMessage(msg.key.remoteJid, {
      text: `*↩️ ᴍᴇssᴀɢᴇ ᴛʀᴀɴsꜰᴇ́ʀᴇ́ sᴜᴘᴘʀɪᴍᴇ́*\n*┃* 👤 @${sender.split('@')[0]}\n*┃* ⚖️ ${action.toUpperCase()}`,
      mentions: [sender],
    });
  } catch (_) {}
}

async function handleAntimessage(sock, msg, groupMetadata) {
  try {
    const settings = database.getGroupSettings(msg.key.remoteJid);
    if (!settings?.antimessage) return;

    const text = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text || ''
    );
    if (!text) return;

    const sender = msg.key.participant || msg.key.remoteJid;
    const participants = groupMetadata?.participants || [];
    if (isAdminJid(participants, sender)) return;
    if (isAllowedUser(sender, settings)) return; // Liste blanche (.allow)

    // Trop long (> 1000 chars) ou trop de majuscules (> 70%)
    const isTooLong   = text.length > 1000;
    const upperRatio  = (text.match(/[A-Z]/g) || []).length / text.length;
    const isSpamCaps  = text.length > 20 && upperRatio > 0.7;

    if (!isTooLong && !isSpamCaps) return;

    try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); } catch (_) {}
    await sock.sendMessage(msg.key.remoteJid, {
      text: `*📵 ᴍᴇssᴀɢᴇ sᴜsᴘᴇᴄᴛ sᴜᴘᴘʀɪᴍᴇ́*\n` +
            `*┃* 👤 @${sender.split('@')[0]}\n` +
            `*┃* ⚠️ ${isTooLong ? 'ᴍᴇssᴀɢᴇ ᴛʀᴏᴘ ʟᴏɴɢ' : 'sᴘᴀᴍ ᴍᴀᴊᴜsᴄᴜʟᴇs'}`,
      mentions: [sender],
    });
  } catch (_) {}
}

async function handleAntisticker(sock, msg, groupMetadata) {
  try {
    const settings = database.getGroupSettings(msg.key.remoteJid);
    if (!settings?.antisticker) return;
    if (!msg.message?.stickerMessage) return;

    const sender = msg.key.participant || msg.key.remoteJid;
    const participants = groupMetadata?.participants || [];
    if (isAdminJid(participants, sender)) return;
    if (isAllowedUser(sender, settings)) return; // Liste blanche (.allow)

    const action = settings.antistickerAction || 'delete';
    try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); } catch (_) {}
    if (action === 'kick') {
      try { await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], 'remove'); } catch (_) {}
    }
  } catch (_) {}
}

async function handleAntitagadmin(sock, msg, groupMetadata) {
  try {
    const settings = database.getGroupSettings(msg.key.remoteJid);
    if (!settings?.antitagadmin) return;

    // Les mentions peuvent aussi arriver via une légende d'image/vidéo
    // (WhatsApp fournit un contextInfo.mentionedJid sur ces types de message,
    // pas uniquement sur extendedTextMessage).
    const ctx      = msg.message?.extendedTextMessage?.contextInfo;
    const ctxImage = msg.message?.imageMessage?.contextInfo;
    const ctxVideo = msg.message?.videoMessage?.contextInfo;
    const mentions = [
      ...(ctx?.mentionedJid      || []),
      ...(ctxImage?.mentionedJid || []),
      ...(ctxVideo?.mentionedJid || []),
    ];
    if (mentions.length === 0) return;

    const participants = groupMetadata?.participants || [];
    const sender       = msg.key.participant || msg.key.remoteJid;
    if (isAdminJid(participants, sender)) return; // Les admins peuvent tag

    // Vérifier si un admin est tagué
    const adminTagged = mentions.some(m => isAdminJid(participants, m));
    if (!adminTagged) return;

    try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); } catch (_) {}
    await sock.sendMessage(msg.key.remoteJid, {
      text: `*🔕 ᴛᴀɢ ᴀᴅᴍɪɴ ɪɴᴛᴇʀᴅɪᴛ*\n*┃* 👤 @${sender.split('@')[0]}\n*┃* 🛡️ ʟᴇs ɢᴀʀᴅɪᴇɴs sᴏɴᴛ ᴘʀᴏᴛᴇ́ɢᴇ́s`,
      mentions: [sender],
    });
  } catch (_) {}
}

// ── Export commandes + handlers ─────────────────────────────────────────────
module.exports = protectionCommands;

// Handlers exportés séparément pour handler.js
module.exports.handlers = {
  handleAntibadword,
  handleAntibot,
  handleAntidemote,
  handleAntiforeign,
  handleAntiforward,
  handleAntimessage,
  handleAntisticker,
  handleAntitagadmin,
};
