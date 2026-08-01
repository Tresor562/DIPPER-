/**
 * Group Settings Commands - 𝐃𝐚𝐫𝐤 Edition
 * .opentime     → ouverture programmée
 * .closetime    → fermeture programmée
 * .announcements → mode annonces
 * .editsettings → modifier paramètres
 * .resetlink    → régénère lien groupe
 * .setgroupname → change nom du groupe
 * .setdesc      → change description
 * .setppgroup   → change photo du groupe
 * .delppgroup   → retire photo du groupe
 * .getgrouppp   → récupère photo du groupe
 */

const database = require('../../database');
const sessionContext = require('../../utils/sessionContext');
const config   = require('../../config.js');
const axios    = require('axios');
const prefix   = config.prefix || '.';

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// Stockage des timers open/close (en mémoire, annulé au redémarrage)
const scheduledTimers = new Map();

module.exports = [

  // ─────────────────────────────────────────────────────────────────────────
  // .opentime — Ouverture programmée
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'opentime',
    aliases: ['scheduleopen', 'ouvertureautomatique'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘʀᴏɢʀᴀᴍᴍᴇ ʟ\'ᴏᴜᴠᴇʀᴛᴜʀᴇ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage: `${prefix}opentime 30  ← ouvre dans 30 minutes`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      const minutes = parseInt(args[0]);
      if (!minutes || minutes < 1 || minutes > 1440) {
        return reply(
          `*╭━≪• ⏰ ᴏᴜᴠᴇʀᴛᴜʀᴇ ᴘʀᴏɢʀᴀᴍᴍᴇ́ᴇ •≫╾╮*\n` +
          `*┃* 📌 ${toSC('indique un delai en minutes (1-1440)')}\n` +
          `  \`${prefix}opentime 30\` ← ᴏᴜᴠʀᴇ ᴅᴀɴs 30 ᴍɪɴ\n\n` +
          extra.phrases.footer()
        );
      }

      // Annuler timer précédent si existant
      const key = sessionContext.scopeKey(`${from}_open`);
      if (scheduledTimers.has(key)) {
        clearTimeout(scheduledTimers.get(key));
      }

      const ms = minutes * 60 * 1000;
      const timer = setTimeout(async () => {
        try {
          await sock.groupSettingUpdate(from, 'not_announcement');
          await sock.sendMessage(from, { text: `*🔓 sᴀɴᴄᴛᴜᴀɪʀᴇ ᴏᴜᴠᴇʀᴛ ✅*\n*┃* ${toSC('le groupe est maintenant ouvert')}` });
        } catch (_) {}
        scheduledTimers.delete(key);
      }, ms);

      scheduledTimers.set(key, timer);

      return reply(
        `*╭━≪• ⏰ ᴏᴜᴠᴇʀᴛᴜʀᴇ ᴘʀᴏɢʀᴀᴍᴍᴇ́ᴇ •≫╾╮*\n` +
        `*┃* ⏱️ ᴅᴀɴs ${minutes} ᴍɪɴᴜᴛᴇ(s)\n` +
        `*┃* 🌑 ${toSC('le sanctuaire s ouvrira automatiquement')}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
      );
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .closetime — Fermeture programmée
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'closetime',
    aliases: ['scheduleclose', 'fermetureautomatique'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘʀᴏɢʀᴀᴍᴍᴇ ʟᴀ ꜰᴇʀᴍᴇᴛᴜʀᴇ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage: `${prefix}closetime 30  ← ferme dans 30 minutes`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      const minutes = parseInt(args[0]);
      if (!minutes || minutes < 1 || minutes > 1440) {
        return reply(
          `*╭━≪• ⏰ ꜰᴇʀᴍᴇᴛᴜʀᴇ ᴘʀᴏɢʀᴀᴍᴍᴇ́ᴇ •≫╾╮*\n` +
          `*┃* 📌 ${toSC('indique un delai en minutes (1-1440)')}\n` +
          `  \`${prefix}closetime 30\` ← ꜰᴇʀᴍᴇ ᴅᴀɴs 30 ᴍɪɴ\n\n` +
          extra.phrases.footer()
        );
      }

      const key = sessionContext.scopeKey(`${from}_close`);
      if (scheduledTimers.has(key)) clearTimeout(scheduledTimers.get(key));

      const ms = minutes * 60 * 1000;
      const timer = setTimeout(async () => {
        try {
          await sock.groupSettingUpdate(from, 'announcement');
          await sock.sendMessage(from, { text: `*🔒 sᴀɴᴄᴛᴜᴀɪʀᴇ ꜰᴇʀᴍᴇ́ 🌑*\n*┃* ${toSC('seuls les admins peuvent ecrire')}` });
        } catch (_) {}
        scheduledTimers.delete(key);
      }, ms);

      scheduledTimers.set(key, timer);

      return reply(
        `*╭━≪• ⏰ ꜰᴇʀᴍᴇᴛᴜʀᴇ ᴘʀᴏɢʀᴀᴍᴍᴇ́ᴇ •≫╾╮*\n` +
        `*┃* ⏱️ ᴅᴀɴs ${minutes} ᴍɪɴᴜᴛᴇ(s)\n` +
        `*┃* 🌑 ${toSC('le sanctuaire se fermera automatiquement')}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
      );
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .announcements — Mode annonces (seuls admins écrivent)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'announcements',
    aliases: ['announce', 'adminonly', 'modeannonces'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴄᴛɪᴠᴇ/ᴅᴇ́sᴀᴄᴛɪᴠᴇ ʟᴇ ᴍᴏᴅᴇ ᴀɴɴᴏɴᴄᴇs',
    usage: `${prefix}announcements on/off`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      const opt = (args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(opt)) {
        return reply(
          `*╭━≪• 📢 ᴍᴏᴅᴇ ᴀɴɴᴏɴᴄᴇs •≫╾╮*\n` +
          `*┃* \`${prefix}announcements on\`  ← admins seulement\n` +
          `*┃* \`${prefix}announcements off\` ← tous peuvent écrire\n\n` +
          extra.phrases.footer()
        );
      }

      try {
        if (opt === 'on') {
          await sock.groupSettingUpdate(from, 'announcement');
          return reply(`*╭━≪• 📢 ᴍᴏᴅᴇ ᴀɴɴᴏɴᴄᴇs •≫╾╮*\n*┃* ✅ ${toSC('active — seuls les admins ecrivent')}\n╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`);
        } else {
          await sock.groupSettingUpdate(from, 'not_announcement');
          return reply(`*╭━≪• 📢 ᴍᴏᴅᴇ ᴀɴɴᴏɴᴄᴇs •≫╾╮*\n*┃* 🔓 ${toSC('desactive — tout le monde peut ecrire')}\n╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`);
        }
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .editsettings — Modifier qui peut éditer les infos du groupe
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'editsettings',
    aliases: ['groupedit', 'editinfo'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ǫᴜɪ ᴘᴇᴜᴛ ᴇ́ᴅɪᴛᴇʀ ʟᴇs ɪɴꜰᴏs ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage: `${prefix}editsettings admin | all`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      const opt = (args[0] || '').toLowerCase();
      if (!['admin', 'all'].includes(opt)) {
        return reply(
          `*╭━≪• ⚙️ ᴘᴀʀᴀᴍᴇ̀ᴛʀᴇs ᴇ́ᴅɪᴛɪᴏɴ •≫╾╮*\n` +
          `*┃* \`${prefix}editsettings admin\` ← admins seulement\n` +
          `*┃* \`${prefix}editsettings all\`   ← tous les membres\n\n` +
          extra.phrases.footer()
        );
      }

      try {
        await sock.groupSettingUpdate(from, opt === 'admin' ? 'locked' : 'unlocked');
        const msg2 = opt === 'admin'
          ? `🔒 ${toSC('seuls les admins peuvent modifier les infos')}`
          : `🔓 ${toSC('tous les membres peuvent modifier les infos')}`;
        return reply(`*╭━≪• ⚙️ ᴘᴀʀᴀᴍᴇ̀ᴛʀᴇs ᴇ́ᴅɪᴛɪᴏɴ •≫╾╮*\n*┃* ${msg2}\n╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`);
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .resetlink — Régénère le lien d'invitation
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'resetlink',
    aliases: ['newlink', 'revokelink', 'regenererlink'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇ́ɢᴇ́ɴᴇ̀ʀᴇ ʟᴇ ʟɪᴇɴ ᴅ\'ɪɴᴠɪᴛᴀᴛɪᴏɴ',
    usage: `${prefix}resetlink`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        const newCode = await sock.groupRevokeInvite(from);
        const newLink = `https://chat.whatsapp.com/${newCode}`;
        return reply(
          `*╭━≪• 🔗 ɴᴏᴜᴠᴇᴀᴜ ʟɪᴇɴ •≫╾╮*\n` +
          `*┃* 🔄 ${toSC('ancien lien invalide')}\n` +
          `*┃* ✅ ${newLink}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .setgroupname — Change le nom du groupe
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'setgroupname',
    aliases: ['groupname', 'setnom', 'renamegroup'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄʜᴀɴɢᴇ ʟᴇ ɴᴏᴍ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage: `${prefix}setgroupname Nouveau Nom`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      const newName = args.join(' ').trim();
      if (!newName) {
        return reply(`*📌 ${toSC('indique le nouveau nom')} : \`${prefix}setgroupname Nom\`*\n\n${extra.phrases.footer()}`);
      }
      if (newName.length > 100) {
        return reply(`*❌ ${toSC('nom trop long (max 100 caracteres)')}*\n\n${extra.phrases.footer()}`);
      }

      try {
        await sock.groupUpdateSubject(from, newName);
        return reply(
          `*╭━≪• ✅ ɴᴏᴍ ᴍᴏᴅɪꜰɪᴇ́ •≫╾╮*\n` +
          `*┃* 🏷️ ${newName}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .setdesc — Change la description du groupe
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'setdesc',
    aliases: ['setdescription', 'groupdesc', 'description'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄʜᴀɴɢᴇ ʟᴀ ᴅᴇsᴄʀɪᴘᴛɪᴏɴ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage: `${prefix}setdesc Nouvelle description`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      const desc = args.join(' ').trim();
      if (!desc) {
        return reply(`*📌 ${toSC('indique la nouvelle description')} : \`${prefix}setdesc texte\`*\n\n${extra.phrases.footer()}`);
      }

      try {
        await sock.groupUpdateDescription(from, desc);
        return reply(
          `*╭━≪• ✅ ᴅᴇsᴄʀɪᴘᴛɪᴏɴ ᴍᴏᴅɪꜰɪᴇ́ᴇ •≫╾╮*\n` +
          `*┃* 📝 ${desc.slice(0, 60)}${desc.length > 60 ? '...' : ''}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .setppgroup — Change la photo de profil du groupe
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'setppgroup',
    aliases: ['setgrouppp', 'groupphoto', 'setphotogroupe'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄʜᴀɴɢᴇ ʟᴀ ᴘʜᴏᴛᴏ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage: `${prefix}setppgroup  [envoyer avec une image en citation]`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        // Récupérer l'image depuis le message cité ou le message lui-même
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imgMsg = msg.message?.imageMessage || quoted?.imageMessage;

        if (!imgMsg) {
          return reply(`*📌 ${toSC('envoie ou cite une image avec la commande')}*\n\n${extra.phrases.footer()}`);
        }

        const stream  = await sock.downloadMediaMessage({ message: { imageMessage: imgMsg } });
        const chunks  = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer  = Buffer.concat(chunks);

        await sock.updateProfilePicture(from, buffer);
        return reply(`*╭━≪• 🖼️ ᴘʜᴏᴛᴏ ᴍᴏᴅɪꜰɪᴇ́ᴇ •≫╾╮*\n*┃* ✅ ${toSC('photo du groupe mise a jour')}\n╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`);
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .delppgroup — Retire la photo du groupe
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'delppgroup',
    aliases: ['removegrouppp', 'supprimerpphoto', 'deletegroupphoto'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴛɪʀᴇ ʟᴀ ᴘʜᴏᴛᴏ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage: `${prefix}delppgroup`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        await sock.removeProfilePicture(from);
        return reply(`*╭━≪• 🗑️ ᴘʜᴏᴛᴏ sᴜᴘᴘʀɪᴍᴇ́ᴇ •≫╾╮*\n*┃* ✅ ${toSC('photo du groupe retiree')}\n╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`);
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .getgrouppp — Affiche la photo du groupe
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'getgrouppp',
    aliases: ['groupphotoget', 'voirphotogroupe', 'getgroupphoto'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀꜰꜰɪᴄʜᴇ ʟᴀ ᴘʜᴏᴛᴏ ᴅᴜ ɢʀᴏᴜᴘᴇ',
    usage: `${prefix}getgrouppp`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from } = extra;

      try {
        const ppUrl = await sock.profilePictureUrl(from, 'image');
        const res   = await axios.get(ppUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const buf   = Buffer.from(res.data);

        await sock.sendMessage(from, {
          image  : buf,
          caption: `*╭━≪• 🖼️ ᴘʜᴏᴛᴏ ᴅᴜ ɢʀᴏᴜᴘᴇ •≫╾╮*\n*┃* ✅ ${toSC('voici la photo actuelle')}\n╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`,
        }, { quoted: msg });
      } catch (err) {
        return reply(`*❌ ${toSC('impossible de recuperer la photo')} : ${err.message?.slice(0, 60)}*\n\n${extra.phrases.footer()}`);
      }
    }
  },

];
