/**
 * Mentions, Stats & Utilities - 𝐃𝐚𝐫𝐤 Edition
 *
 * MENTIONS & INTERACTIONS :
 *   .tagadmin    → mentionne tous les admins
 *   (.mediatag → voir commands/group_management/mediatag.js)
 *
 * STATS & INFOS :
 *   .totalmembers  → nombre total de membres
 *   .listactive    → membres actifs (ayant envoyé un msg récemment)
 *   .listinactive  → membres inactifs
 *   .listrequests  → demandes d'adhésion en attente
 *   .userid        → affiche le JID/numéro d'un utilisateur
 *
 * UTILITAIRES :
 *   .poll         → crée un sondage WhatsApp natif
 */

const database = require('../../database');
const config   = require('../../config.js');
const axios    = require('axios');
const sessionContext = require('../../utils/sessionContext');
const prefix   = config.prefix || '.';

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// Suivi activité en mémoire : { groupId: { jid: lastTimestamp } }
const activityMap = new Map();

// Nettoyage automatique de activityMap toutes les heures
// Sans ça, la Map grossit indéfiniment → fuite mémoire → ralentissement
setInterval(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // garder 7 jours
  for (const [groupId, members] of activityMap.entries()) {
    for (const [jid, ts] of Object.entries(members)) {
      if (ts < cutoff) delete members[jid];
    }
    if (Object.keys(members).length === 0) activityMap.delete(groupId);
  }
}, 60 * 60 * 1000);

/**
 * Appelé depuis handler.js pour tracer l'activité des membres.
 * Ajouter dans handler.js après la détection du sender :
 *   trackMemberActivity(from, sender);
 */
function trackMemberActivity(groupId, senderJid) {
  if (!groupId || !senderJid) return;
  const key = sessionContext.scopeKey(groupId);
  if (!activityMap.has(key)) activityMap.set(key, {});
  activityMap.get(key)[senderJid] = Date.now();
}

module.exports = [

  // ─────────────────────────────────────────────────────────────────────────
  // .tagadmin — Mentionne tous les admins
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'tagadmin',
    aliases: ['adminmention', 'mentionadmin', 'pingadmin'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴍᴇɴᴛɪᴏɴɴᴇ ᴛᴏᴜs ʟᴇs ᴀᴅᴍɪɴs',
    usage: `${prefix}tagadmin [message optionnel]`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, groupMetadata } = extra;

      try {
        const participants = groupMetadata?.participants || (await sock.groupMetadata(from)).participants;
        const admins       = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');

        if (admins.length === 0) {
          return reply(`*🌑 ${toSC('aucun admin trouve dans ce groupe')}*\n\n${extra.phrases.footer()}`);
        }

        const mentions = admins.map(p => p.id);
        const text     = args.join(' ').trim();
        const list     = admins.map((p, i) => `*┃* ${i + 1}. 🛡️ @${p.id.split('@')[0]}`).join('\n');

        await sock.sendMessage(from, {
          text:
            `*╭━≪• 🛡️ ᴀᴅᴍɪɴs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ •≫╾╮*\n` +
            `*┃* 📊 ${admins.length} ɢᴀʀᴅɪᴇɴ(s)\n` +
            `*┃*\n` +
            `${list}\n` +
            (text ? `*┃*\n*┃* 📢 ${text}\n` : '') +
            `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`,
          mentions,
        }, { quoted: msg });
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // [FIX] .mediatag retiré d'ici — doublon en collision avec la commande
  // dédiée commands/group_management/mediatag.js (même nom, alias 'tagmedia'
  // en commun). Voir ce fichier pour l'implémentation canonique.
  // L'alias 'sendtag' a été repris dans mediatag.js pour ne rien casser.
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // .totalmembers — Nombre total de membres
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'totalmembers',
    aliases: ['countmembers', 'nbmembres', 'memberscount'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀꜰꜰɪᴄʜᴇ ʟᴇ ɴᴏᴍʙʀᴇ ᴅᴇ ᴍᴇᴍʙʀᴇs',
    usage: `${prefix}totalmembers`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, groupMetadata } = extra;

      try {
        const meta     = groupMetadata || await sock.groupMetadata(from);
        const total    = meta.participants?.length || 0;
        const admins   = meta.participants?.filter(p => p.admin).length || 0;
        const members  = total - admins;

        return reply(
          `*╭━≪• 📊 sᴛᴀᴛs ᴍᴇᴍʙʀᴇs •≫╾╮*\n` +
          `*┃*\n` +
          `*┃* 👥 ᴛᴏᴛᴀʟ     : ${total}\n` +
          `*┃* 🛡️ ᴀᴅᴍɪɴs   : ${admins}\n` +
          `*┃* 👤 ᴍᴇᴍʙʀᴇs  : ${members}\n` +
          `*┃*\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .listactive — Membres actifs (ont envoyé un message dans les 7 derniers jours)
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'listactive',
    aliases: ['actifs', 'membresactifs', 'activemembers'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʟɪsᴛᴇ ʟᴇs ᴍᴇᴍʙʀᴇs ᴀᴄᴛɪꜰs (7 ᴊᴏᴜʀs)',
    usage: `${prefix}listactive`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, groupMetadata } = extra;

      try {
        const meta       = groupMetadata || await sock.groupMetadata(from);
        const activity   = activityMap.get(sessionContext.scopeKey(from)) || {};
        const sevenDays  = 7 * 24 * 60 * 60 * 1000;
        const now        = Date.now();

        const active = meta.participants.filter(p => {
          const last = activity[p.id];
          return last && (now - last) < sevenDays;
        });

        if (active.length === 0) {
          return reply(`*🌑 ${toSC('aucun membre actif enregistre (le bot doit etre present depuis quelques jours)')}*\n\n${extra.phrases.footer()}`);
        }

        const mentions = active.map(p => p.id);
        const list     = active.slice(0, 30).map((p, i) => `*┃* ${i + 1}. @${p.id.split('@')[0]}`).join('\n');
        const more     = active.length > 30 ? `\n*┃* ... +${active.length - 30} ᴅ\'ᴀᴜᴛʀᴇs` : '';

        await sock.sendMessage(from, {
          text:
            `*╭━≪• ✅ ᴍᴇᴍʙʀᴇs ᴀᴄᴛɪꜰs •≫╾╮*\n` +
            `*┃* 📊 ${active.length} ᴀᴄᴛɪꜰ(s) / 7 ᴊᴏᴜʀs\n*┃*\n` +
            `${list}${more}\n` +
            `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`,
          mentions,
        }, { quoted: msg });
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .listinactive — Membres inactifs
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'listinactive',
    aliases: ['inactifs', 'membresinactifs', 'inactivemembers'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʟɪsᴛᴇ ʟᴇs ᴍᴇᴍʙʀᴇs ɪɴᴀᴄᴛɪꜰs',
    usage: `${prefix}listinactive [jours] (défaut: 7)`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from, groupMetadata } = extra;

      try {
        const days     = Math.max(1, parseInt(args[0]) || 7);
        const meta     = groupMetadata || await sock.groupMetadata(from);
        const activity = activityMap.get(sessionContext.scopeKey(from)) || {};
        const limit    = days * 24 * 60 * 60 * 1000;
        const now      = Date.now();

        const inactive = meta.participants.filter(p => {
          const last = activity[p.id];
          return !last || (now - last) >= limit;
        });

        if (inactive.length === 0) {
          return reply(`*🌟 ${toSC('tous les membres sont actifs')} !*\n\n${extra.phrases.footer()}`);
        }

        const mentions = inactive.slice(0, 30).map(p => p.id);
        const list     = inactive.slice(0, 30).map((p, i) => `*┃* ${i + 1}. @${p.id.split('@')[0]}`).join('\n');
        const more     = inactive.length > 30 ? `\n*┃* ... +${inactive.length - 30} ᴅ\'ᴀᴜᴛʀᴇs` : '';

        await sock.sendMessage(from, {
          text:
            `*╭━≪• 💤 ᴍᴇᴍʙʀᴇs ɪɴᴀᴄᴛɪꜰs •≫╾╮*\n` +
            `*┃* 📊 ${inactive.length} ɪɴᴀᴄᴛɪꜰ(s) / ${days} ᴊᴏᴜʀs\n*┃*\n` +
            `${list}${more}\n` +
            `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`,
          mentions,
        }, { quoted: msg });
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .listrequests — Demandes d'adhésion en attente
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'listrequests',
    aliases: ['demandesattente', 'pendingrequests', 'joinrequests'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀꜰꜰɪᴄʜᴇ ʟᴇs ᴅᴇᴍᴀɴᴅᴇs ᴇɴ ᴀᴛᴛᴇɴᴛᴇ',
    usage: `${prefix}listrequests`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: true,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        const meta    = await sock.groupMetadata(from);
        const pending = (meta.participants || []).filter(p => p.requestedToJoin || p.pending);

        if (pending.length === 0) {
          return reply(`*🌑 ${toSC('aucune demande en attente')}.*\n\n${extra.phrases.footer()}`);
        }

        const list = pending.map((p, i) =>
          `*┃* ${i + 1}. 👤 +${p.id.split('@')[0]}`
        ).join('\n');

        return reply(
          `*╭━≪• 📋 ᴅᴇᴍᴀɴᴅᴇs ᴇɴ ᴀᴛᴛᴇɴᴛᴇ •≫╾╮*\n` +
          `*┃* 📊 ${pending.length} ᴅᴇᴍᴀɴᴅᴇ(s)\n*┃*\n` +
          `${list}\n` +
          `*┃*\n` +
          `*┃* ✅ \`${prefix}approve +num\`\n` +
          `*┃* ❌ \`${prefix}reject +num\`\n` +
          `*┃* ❌ \`${prefix}disapproveall\`\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .userid — Affiche le JID / numéro d'un utilisateur
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'userid',
    aliases: ['whois', 'getid', 'jid'],
    category: '⚙️ Gestion de groupe',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀꜰꜰɪᴄʜᴇ ʟ\'ɪᴅᴇɴᴛɪꜰɪᴀɴᴛ ᴅ\'ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ',
    usage: `${prefix}userid [@mention ou répondre à un message]`,
    groupOnly: false,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, sender, from } = extra;

      try {
        const ctx       = msg.message?.extendedTextMessage?.contextInfo;
        const mentioned = ctx?.mentionedJid || [];
        const quotedJid = ctx?.participant;
        const targetJid = mentioned[0] || quotedJid || sender;

        const num = targetJid.split('@')[0].split(':')[0];

        return reply(
          `*╭━≪• 🔍 ᴜsᴇʀ ɪᴅ •≫╾╮*\n` +
          `*┃*\n` +
          `*┃* 👤 @${num}\n` +
          `*┃* 📱 *ɴᴜᴍᴇ́ʀᴏ :* +${num}\n` +
          `*┃* 🔑 *ᴊɪᴅ :* \`${targetJid}\`\n` +
          `*┃*\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`,
          { mentions: [targetJid] }
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .poll — Crée un sondage WhatsApp natif
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'poll',
    aliases: ['sondage', 'vote', 'createpoll'],
    category: '🛠️ Outils généraux',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄʀᴇ́ᴇ ᴜɴ sᴏɴᴅᴀɢᴇ ᴡʜᴀᴛsᴀᴘᴘ ɴᴀᴛɪꜰ',
    usage: `${prefix}poll Question? | Option1 | Option2 | Option3`,
    groupOnly: false,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, from } = extra;

      const raw = args.join(' ');
      if (!raw.includes('|')) {
        return reply(
          `*╭━≪• 🗳️ ᴄʀᴇ́ᴇʀ ᴜɴ sᴏɴᴅᴀɢᴇ •≫╾╮*\n` +
          `*┃* 📌 ${toSC('format')} :\n` +
          `*┃* \`${prefix}poll Question? | Option1 | Option2\`\n` +
          `*┃*\n` +
          `*┃* 💡 ${toSC('exemple')} :\n` +
          `*┃* \`${prefix}poll C'est quoi le meilleur? | THE BIG DIPPER | Autre bot\`\n\n` +
          extra.phrases.footer()
        );
      }

      const parts   = raw.split('|').map(s => s.trim()).filter(Boolean);
      const question = parts[0];
      const options  = parts.slice(1);

      if (options.length < 2) {
        return reply(`*❌ ${toSC('minimum 2 options requises')}*\n\n${extra.phrases.footer()}`);
      }
      if (options.length > 12) {
        return reply(`*❌ ${toSC('maximum 12 options')}*\n\n${extra.phrases.footer()}`);
      }

      try {
        await sock.sendMessage(from, {
          poll: {
            name        : question,
            values      : options,
            selectableCount: 1,
          }
        }, { quoted: msg });
      } catch (err) {
        // Fallback texte si poll non supporté
        const opts = options.map((o, i) => `*┃* ${i + 1}. ${o}`).join('\n');
        await reply(
          `*╭━≪• 🗳️ sᴏɴᴅᴀɢᴇ •≫╾╮*\n` +
          `*┃* ❓ ${question}\n*┃*\n` +
          `${opts}\n` +
          `*┃*\n` +
          `*┃* 💬 ${toSC('reponds avec le numero de ton choix')}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      }
    }
  },

];

// Export de trackMemberActivity pour handler.js
module.exports.trackMemberActivity = trackMemberActivity;
