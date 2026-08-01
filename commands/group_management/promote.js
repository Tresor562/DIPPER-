/**
 * Promote Command - Make member admin
 * 𝐃𝐚𝐫𝐤 Edition
 */

const { findParticipant } = require('../../utils/jidHelpers');
const modlog = require('../../utils/modlog');
const config = require('../../config.js'); 

// Fonction pour le style Small Caps (Cohérence visuelle du sanctuaire)
function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

  const cleanedText = text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 

  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

const prefix = config.prefix || '.';

module.exports = {
  name: 'promote',
  aliases: ['makeadmin', 'elever', 'prom'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇʟᴇᴠᴇ ᴜɴ ᴍᴇᴍʙʀᴇ ᴀᴜ ʀᴀɴɢ ᴅᴇ ɢᴀʀᴅɪᴇɴ (ᴀᴅᴍɪɴ)',
  usage: `${prefix}promote @user`, // 💡 Dynamique avec ton préfixe actuel
  groupOnly: true,
  adminOnly: false, // Traitement manuel ci-dessous pour inclure les Maîtres
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, sender } = extra;

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      // isOwner est directement extrait par le Handler et te donne les pleins pouvoirs
      const isMe = msg.key.fromMe || isOwner;

      // 🚨 ÉVALUATION DES DROITS
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette incantation est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } else if (ctx?.participant && ctx?.stanzaId) { // Gère la réponse à un message
        target = ctx.participant;
      } else {
        return reply(`*❌ ${toSmallCaps('veuillez mentionner ou repondre a l individu a promouvoir')} !*\n\n*ᴇxᴇᴍᴘʟᴇ :* \`${prefix}promote @user\`\n\n${extra.phrases.footer()}`);
      }

      const chatId = msg.key.remoteJid;

      // Fetch FRESH group metadata to avoid stale cache
      const freshMetadata = await sock.groupMetadata(chatId);

      // Use findParticipant for LID-aware matching with fresh metadata
      const foundParticipant = findParticipant(freshMetadata.participants, target);

      if (!foundParticipant) {
        return reply(`*❌ ${toSmallCaps('cet individu ne fait pas partie du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      // Check if already admin using fresh data
      if (foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin') {
        return reply(`*❌ ${toSmallCaps('cet individu est deja un gardien (administrateur)')} !*\n\n${extra.phrases.footer()}`);
      }

      await sock.groupParticipantsUpdate(chatId, [target], 'promote');

      modlog.addEntry(chatId, 'promote', {
        by: sender || msg.key.participant || msg.key.remoteJid,
        target,
        groupName: freshMetadata.subject,
      });

      // Notification d'élévation stylisée
      await sock.sendMessage(chatId, {
        text: `📈 *@${target.split('@')[0]} ${toSmallCaps('a ete eleve au rang de gardien du sanctuaire')} !*\n\n${extra.phrases.footer()}`,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      console.error('Promote Command Error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
