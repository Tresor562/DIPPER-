/**
 * Commande demote - dissoudre un admin
 * Version : Prestige V5.2 - Full Power (Design Small Caps)
 * ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐃𝐚𝐫𝐤
 */

// Importation de ta fonction personnalisée
const { findParticipant } = require('../../utils/jidHelpers'); 
const modlog = require('../../utils/modlog');
const config = require('../../config.js');

const prefix = config.prefix || '.';

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

module.exports = {
  name: 'demote',
  aliases: ['removeadmin', 'dem', 'destituer', 'rabaisser', 'ᴅᴇᴍᴏᴛᴇ'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴛɪʀᴇ ʟᴇs ᴘʀɪᴠɪʟᴇ̀ɢᴇs ᴀᴅᴍɪɴ ᴅ\'ᴜɴ ᴍᴇᴍʙʀᴇ',
  usage: `${prefix}demote @user | réponse`,
  groupOnly: true,
  adminOnly: false, // Traitement manuel ci-dessous pour inclure les Maîtres
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, sender } = extra;

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      const isMe = msg.key.fromMe || isOwner;

      // 🚨 ÉVALUATION DES DROITS
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette commande est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      let target;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      // 1. On cherche d'abord la mention @user
      if (mentioned && mentioned.length > 0) {
        target = mentioned[0];
      } 
      // 2. Si pas de mention, on regarde si on répond à un message existant
      else if (ctx?.participant && ctx?.stanzaId) {
        target = ctx.participant;
      } 

      if (!target) {
        return reply(
          `*╭━≪• ᴅᴇsᴛɪᴛᴜᴛɪᴏɴ •≫╾╮*\n` +
          `*┃* *ᴇ́ᴛᴀᴛ* : ᴇ́ᴄʜᴇᴄ ❌\n\n` +
          `*┃* 🔮 *${toSmallCaps('incantations disponibles')} :*\n` +
          `*┃* *${toSmallCaps('veuillez mentionner ou repondre a')}*\n` +
          `*┃* *${toSmallCaps('l individu a destituer')}.*\n\n` +
          `  ${prefix}demote @user\n\n` +
          extra.phrases.footer()
        );
      }

      const chatId = msg.key.remoteJid;

      // Récupération sécurisée des métadonnées du groupe
      const freshMetadata = await sock.groupMetadata(chatId);
      
      // Utilisation de ta fonction personnalisée pour cibler l'utilisateur
      const foundParticipant = findParticipant(freshMetadata.participants, target);

      if (!foundParticipant) {
        return reply(`❌ *${toSmallCaps('cet individu ne fait pas partie du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      // On vérifie s'il est bien admin avant de le destituer
      const isTargetAdmin = foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin';

      if (!isTargetAdmin) {
        return reply(`❌ *${toSmallCaps('cet individu n est pas un gardien (administrateur)')} !*\n\n${extra.phrases.footer()}`);
      }

      // Exécution de la destitution
      await sock.groupParticipantsUpdate(chatId, [target], 'demote');

      modlog.addEntry(chatId, 'demote', {
        by: sender || msg.key.participant || msg.key.remoteJid,
        target,
        groupName: freshMetadata.subject,
      });

      await sock.sendMessage(chatId, {
        text: `📉 *@${target.split('@')[0]} ${toSmallCaps('a ete destitue du rang de gardien du sanctuaire')} !*\n\n${extra.phrases.footer()}`,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      return reply(`❌ *${toSmallCaps('erreur')} :* ${error.message}\n\n${extra.phrases.footer()}`);
    }
  }
};
