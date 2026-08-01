/**
 * Whitelist System - 𝐃𝐚𝐫𝐤 Edition
 * .allow       → autorise un utilisateur (bypass antilink/antispam etc.)
 * .delallowed  → retire une autorisation
 * .listallowed → liste les utilisateurs autorisés
 *
 * Stockage : database.getGroupSettings(from).allowedUsers = [jid, jid, ...]
 */

const database = require('../../database');
const config   = require('../../config.js');
const { buildComparableIds, isAllowedUser } = require('../../utils/jidHelpers');
const prefix   = config.prefix || '.';

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// Helper : obtenir la cible (mention ou numéro)
function getTarget(msg, args) {
  const ctx       = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  if (mentioned[0]) return mentioned[0];
  if (args[0]) return args[0].replace(/\D/g, '') + '@s.whatsapp.net';
  return null;
}

// [FIX CRITIQUE — audit transversal] Normalise un JID cible vers sa forme
// canonique en réutilisant buildComparableIds (même logique déjà validée
// pour kickall/demote/promote), au lieu de reconstruire le JID à la main.
// L'ancien code forçait TOUJOURS "@s.whatsapp.net", y compris pour un LID
// (ex: "161234567890123@lid" devenait "161234567890123@s.whatsapp.net",
// un JID fantaisiste qui ne correspond à personne) : un ".allow" sur un
// membre identifié par LID était donc silencieusement inopérant (aucune
// erreur affichée, mais l'utilisateur restait bloqué par antilink/antispam).
// Pour un JID déjà en @s.whatsapp.net (cas normal, numéro tapé ou mention
// PN), le résultat est strictement identique à avant — seul le suffixe
// ":device" est retiré, exactement comme le faisait l'ancien code.
function canonicalJid(rawJid) {
  return buildComparableIds(rawJid)[0] || rawJid;
}

module.exports = [

  // ─────────────────────────────────────────────────────────────────────────
  // .allow — Ajoute un utilisateur à la whitelist du groupe
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'allow',
    aliases: ['allow_list'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴜᴛᴏʀɪsᴇ ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ (ʙʏᴘᴀss ᴘʀᴏᴛᴇᴄᴛɪᴏɴs)',
    usage: `${prefix}allow @mention | ${prefix}allow 229XXXXXXXX`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      const targetJid = getTarget(msg, args);
      if (!targetJid) {
        return reply(
          `*╭━≪• ⚙️ ᴀᴜᴛᴏʀɪsᴇʀ •≫╾╮*\n` +
          `*┃* 📌 ${toSC('mentionne ou donne un numero')}\n` +
          `  \`${prefix}allow @mention\`\n` +
          `  \`${prefix}allow 229XXXXXXXX\`\n\n` +
          extra.phrases.footer()
        );
      }

      try {
        const settings     = database.getGroupSettings(from);
        const allowed      = settings.allowedUsers || [];
        const cleanJid     = canonicalJid(targetJid);

        if (isAllowedUser(targetJid, settings)) {
          return reply(`*⚠️ ${toSC('cet utilisateur est deja autorise')} !*\n\n${extra.phrases.footer()}`);
        }

        allowed.push(cleanJid);
        database.updateGroupSettings(from, { allowedUsers: allowed });

        return reply(
          `*╭━≪• ✅ ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ ᴀᴄᴄᴏʀᴅᴇ́ᴇ •≫╾╮*\n` +
          `*┃* 👤 @${cleanJid.split('@')[0]}\n` +
          `*┃* 🟢 ${toSC('bypass protections actif')}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`,
          { mentions: [cleanJid] }
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .delallowed — Retire un utilisateur de la whitelist
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'delallowed',
    aliases: ['del_allowed', 'unwhitelist', 'removeallow'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴛɪʀᴇ ᴜɴᴇ ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ',
    usage: `${prefix}delallowed @mention`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      const targetJid = getTarget(msg, args);
      if (!targetJid) {
        return reply(
          `*╭━≪• ⚙️ ʀᴇᴛɪʀᴇʀ ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ •≫╾╮*\n` +
          `*┃* 📌 ${toSC('mentionne ou donne un numero')}\n` +
          `  \`${prefix}delallowed @mention\`\n\n` +
          extra.phrases.footer()
        );
      }

      try {
        const settings = database.getGroupSettings(from);
        const cleanJid = canonicalJid(targetJid);
        const targets  = buildComparableIds(targetJid);
        // Comparaison via buildComparableIds (comme isAllowedUser) plutôt
        // qu'une égalité stricte de chaîne : permet aussi de retirer une
        // entrée historique qui aurait été stockée sous un ancien format
        // avant ce correctif, sans avoir besoin d'un script de migration.
        const allowed  = (settings.allowedUsers || [])
          .filter(j => !buildComparableIds(j).some(id => targets.includes(id)));

        database.updateGroupSettings(from, { allowedUsers: allowed });

        return reply(
          `*╭━≪• 🔴 ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ ʀᴇᴛɪʀᴇ́ᴇ •≫╾╮*\n` +
          `*┃* 👤 @${cleanJid.split('@')[0]}\n` +
          `*┃* ⛔ ${toSC('protections reactives')}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // .listallowed — Affiche la whitelist du groupe
  // ─────────────────────────────────────────────────────────────────────────
  {
    name: 'listallowed',
    aliases: ['whitelist', 'autorisations', 'listeautorisees'],
    category: '🛡️ Protections',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʟɪsᴛᴇ ʟᴇs ᴜᴛɪʟɪsᴀᴛᴇᴜʀs ᴀᴜᴛᴏʀɪsᴇ́s',
    usage: `${prefix}listallowed`,
    groupOnly: true,
    adminOnly: false,
    botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, isOwner, isAdmin, from } = extra;
      if (!isOwner && !isAdmin) {
        return reply(`*❌ ${toSC('incantation reservee aux administrateurs')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        const settings = database.getGroupSettings(from);
        const allowed  = settings.allowedUsers || [];

        if (allowed.length === 0) {
          return reply(`*🌑 ${toSC('aucun utilisateur autorise dans ce sanctuaire')}.*\n\n${extra.phrases.footer()}`);
        }

        const list = allowed.map((j, i) => `*┃* ${i + 1}. 👤 +${j.split('@')[0]}`).join('\n');

        return reply(
          `*╭━≪• ⚙️ ʟɪsᴛᴇ ʙʟᴀɴᴄʜᴇ •≫╾╮*\n` +
          `*┃* 📊 ${allowed.length} ᴜᴛɪʟɪsᴀᴛᴇᴜʀ(s)\n` +
          `*┃*\n` +
          `${list}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
        );
      } catch (err) {
        return reply(`*❌ ${toSC('erreur')} :* ${err.message?.slice(0, 80)}\n\n${extra.phrases.footer()}`);
      }
    }
  },

];
