/**
 * Requests Commands - 𝐃𝐚𝐫𝐤 Edition
 * .approve    → accepte une demande d'adhésion individuelle
 * .reject     → refuse une demande individuelle
 * .disapproveall → refuse toutes les demandes en attente
 * .cancelkick → réintègre un membre expulsé (invite privée)
 */

const config  = require('../../config.js');
const modlog  = require('../../utils/modlog');
const prefix  = config.prefix || '.';

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// ── Récupère les demandes d'adhésion en attente ────────────────────────────
// Utilise sock.groupRequestParticipantsList(), l'API Baileys officielle pour
// les demandes d'adhésion en attente (déjà validée dans approveall.js).
// Les demandes en attente NE font PAS partie de groupMetadata().participants —
// filtrer ce tableau sur p.requestedToJoin/p.pending (ancienne implémentation)
// ne trouvait donc jamais rien en usage réel.
async function getPendingRequests(sock, groupId) {
  try {
    const pendingList = await sock.groupRequestParticipantsList(groupId);
    return pendingList || [];
  } catch (_) { return []; }
}

module.exports = [

  // ─────────────────────────────────────────────────────────────────────────
  // .approve — Accepte une demande d'adhésion individuelle
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'approve',
    aliases: ['accepter', 'approuver'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴄᴄᴇᴘᴛᴇ ᴜɴᴇ ᴅᴇᴍᴀɴᴅᴇ ᴅ\'ᴀᴅʜᴇ́sɪᴏɴ ɪɴᴅɪᴠɪᴅᴜᴇʟʟᴇ',
    usage: `${prefix}approve @mention | ${prefix}approve 229XXXXXXXX`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from, sender, groupMetadata } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        // Cible via mention ou numéro
        const ctx       = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];
        let targetJid   = mentioned[0];

        if (!targetJid && args[0]) {
          targetJid = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
        }
        if (!targetJid) {
          return reply(
            `*╭━≪• 🔮 ᴀᴘᴘʀᴏᴜᴠᴇʀ •≫╾╮*\n` +
            `*┃* 📌 ${toSC('mentionne ou indique un numero')}\n` +
            `  \`${prefix}approve @mention\`\n` +
            `  \`${prefix}approve 229XXXXXXXX\`\n\n` +
            extra.phrases.footer()
          );
        }

        // Approuver via groupRequestParticipantsUpdate
        await sock.groupRequestParticipantsUpdate(from, [targetJid], 'approve');

        modlog.addEntry(from, 'approve', {
          by: sender || msg.key.participant || msg.key.remoteJid,
          target: targetJid,
          groupName: groupMetadata?.subject,
        });

        const num = targetJid.split('@')[0];
        return reply(
          `*╭━≪• ✅ ᴀᴅʜᴇ́sɪᴏɴ ᴀᴘᴘʀᴏᴜᴠᴇ́ᴇ •≫╾╮*\n` +
          `*┃* 👤 +${num}\n` +
          `*┃* 🌑 ${toSC('bienvenue dans le sanctuaire')}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .reject — Refuse une demande individuelle
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'reject',
    aliases: ['refuserdemande', 'refuser'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇꜰᴜsᴇ ᴜɴᴇ ᴅᴇᴍᴀɴᴅᴇ ᴅ\'ᴀᴅʜᴇ́sɪᴏɴ',
    usage: `${prefix}reject @mention | ${prefix}reject 229XXXXXXXX`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from, sender, groupMetadata } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        const ctx       = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];
        let targetJid   = mentioned[0];

        if (!targetJid && args[0]) {
          targetJid = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
        }
        if (!targetJid) {
          return reply(
            `*╭━≪• 🔮 ʀᴇᴊᴇᴛᴇʀ •≫╾╮*\n` +
            `*┃* 📌 ${toSC('mentionne ou indique un numero')}\n` +
            `  \`${prefix}reject @mention\`\n\n` +
            extra.phrases.footer()
          );
        }

        await sock.groupRequestParticipantsUpdate(from, [targetJid], 'reject');

        modlog.addEntry(from, 'reject', {
          by: sender || msg.key.participant || msg.key.remoteJid,
          target: targetJid,
          groupName: groupMetadata?.subject,
        });

        const num = targetJid.split('@')[0];
        return reply(
          `*╭━≪• 🚫 ᴅᴇᴍᴀɴᴅᴇ ʀᴇᴊᴇᴛᴇ́ᴇ •≫╾╮*\n` +
          `*┃* 👤 +${num}\n` +
          `*┃* ⛔ ${toSC('acces au sanctuaire refuse')}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .disapproveall — Refuse toutes les demandes en attente
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'disapproveall',
    aliases: ['rejectall', 'rejeterall', 'refuserall'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴊᴇᴛᴛᴇ ᴛᴏᴜᴛᴇs ʟᴇs ᴅᴇᴍᴀɴᴅᴇs ᴇɴ ᴀᴛᴛᴇɴᴛᴇ',
    usage: `${prefix}disapproveall`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from, sender, groupMetadata } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        const pending = await getPendingRequests(sock, from);
        if (pending.length === 0) {
          return reply(`*🌑 ${toSC('aucune demande en attente dans le sanctuaire')}.*\n\n${extra.phrases.footer()}`);
        }

        const jids = pending.map(p => p.jid);
        await sock.groupRequestParticipantsUpdate(from, jids, 'reject');

        modlog.addEntry(from, 'reject', {
          by: sender || msg.key.participant || msg.key.remoteJid,
          reason: `${jids.length} demande(s) en masse`,
          groupName: groupMetadata?.subject,
        });

        return reply(
          `*╭━≪• 🚫 ᴘᴜʀɢᴇ ᴅᴇs ᴅᴇᴍᴀɴᴅᴇs •≫╾╮*\n` +
          `*┃* 📊 ${jids.length} ᴅᴇᴍᴀɴᴅᴇ(s) ʀᴇᴊᴇᴛᴇ́ᴇ(s)\n` +
          `*┃* ⛔ ${toSC('le sanctuaire reste ferme')}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .cancelkick — Réintègre un membre expulsé via invitation privée
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'cancelkick',
    aliases: ['unkick', 'reaccepter', 'reinviter'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇ́ɪɴᴛᴇ̀ɢʀᴇ ᴜɴ ᴍᴇᴍʙʀᴇ ᴇxᴘᴜʟsᴇ́',
    usage: `${prefix}cancelkick @mention | ${prefix}cancelkick 229XXXXXXXX`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from, sender, groupMetadata } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        const ctx       = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];
        let targetJid   = mentioned[0];

        if (!targetJid && args[0]) {
          targetJid = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
        }
        if (!targetJid) {
          return reply(
            `*╭━≪• 🔮 ᴀɴɴᴜʟᴇʀ ᴇxᴘᴜʟsɪᴏɴ •≫╾╮*\n` +
            `*┃* 📌 ${toSC('mentionne ou indique le numero')}\n` +
            `  \`${prefix}cancelkick @mention\`\n\n` +
            extra.phrases.footer()
          );
        }

        // Tenter ajout direct (si bot admin)
        let added = false;
        try {
          const res = await sock.groupParticipantsUpdate(from, [targetJid], 'add');
          added = res?.[0]?.status === '200' || res?.[0]?.status === 200;
        } catch (_) {}

        if (!added) {
          // Fallback : invitation privée (pas de ré-adhésion confirmée -> pas de log modlog ici)
          const inviteCode = await sock.groupInviteCode(from);
          const link       = `https://chat.whatsapp.com/${inviteCode}`;
          await sock.sendMessage(targetJid, {
            text: `🌑 *ʟ'ᴏᴍʙʀᴇ ᴛ'ɪɴᴠɪᴛᴇ ᴀ̀ ʀᴇᴊᴏɪɴᴅʀᴇ ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ :*\n${link}`
          });
          return reply(
            `*╭━≪• 📩 ɪɴᴠɪᴛᴀᴛɪᴏɴ ᴇɴᴠᴏʏᴇ́ᴇ •≫╾╮*\n` +
            `*┃* 👤 +${targetJid.split('@')[0]}\n` +
            `*┃* 📬 ${toSC('invitation privee envoyee')}\n` +
            `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
          );
        }

        modlog.addEntry(from, 'add', {
          by: sender || msg.key.participant || msg.key.remoteJid,
          target: targetJid,
          reason: 'cancelkick',
          groupName: groupMetadata?.subject,
        });

        return reply(
          `*╭━≪• ✅ ᴍᴇᴍʙʀᴇ ʀᴇ́ɪɴᴛᴇ́ɢʀᴇ́ •≫╾╮*\n` +
          `*┃* 👤 +${targetJid.split('@')[0]}\n` +
          `*┃* 🌑 ${toSC('bienvenue de retour dans le sanctuaire')}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

];
