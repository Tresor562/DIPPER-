/**
 * Delete Command
 * Delete a replied message and the command itself
 */

const config = require('../../config.js');
const modlog = require('../../utils/modlog');

// Extraction du préfixe pour l'usage
const prefix = config.prefix || '.';

// Fonction pour le style Small Caps (Garde la cohérence visuelle)
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
  name: 'delete',
  aliases: ['del', 'dlt', 'd', 'supprime', 'ᴅᴇʟᴇᴛᴇ'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sᴜᴘᴘʀɪᴍᴇ ᴜɴ ᴍᴇssᴀɢᴇ ᴇɴ ʀᴇ́ᴘᴏɴsᴇ ᴇᴛ ʟᴀ ᴄᴏᴍᴍᴀɴᴅᴇ',
  usage: `${prefix}delete`,
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
        return reply(`*❌ ${toSmallCaps('cette commande est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const ctx = msg.message?.extendedTextMessage?.contextInfo;

      if (!ctx?.stanzaId || !ctx?.participant) {
        return reply(
          `*╭━≪• ᴇʟɪᴍɪɴᴀᴛɪᴏɴ_ᴄɪʙʟᴇᴇ •≫╾╮*\n` +
          `*┃* *ᴇ́ᴛᴀᴛ* : ᴇ́ᴄʜᴇᴄ ❌\n\n` +
          `*┃* 🔮 *${toSmallCaps('incantations disponibles')} :*\n` +
          `*┃* *${toSmallCaps('reponds au message que tu souhaites')}*\n` +
          `*┃* *${toSmallCaps('faire disparaitre')}.*\n\n` +
          `  ${prefix}delete\n\n` +
          extra.phrases.footer()
        );
      }

      const chatId = msg.key.remoteJid;

      // 1. Clé pour supprimer le message auquel on répond
      const deleteTargetKey = { 
        remoteJid: chatId, 
        id: ctx.stanzaId, 
        participant: ctx.participant 
      };

      // 2. Clé pour supprimer le message de commande actuel (.delete)
      const deleteCommandKey = {
        remoteJid: chatId,
        id: msg.key.id,
        participant: msg.key.participant || msg.key.remoteJid
      };

      // On exécute les deux suppressions
      await sock.sendMessage(chatId, { delete: deleteTargetKey });
      await sock.sendMessage(chatId, { delete: deleteCommandKey });

      modlog.addEntry(chatId, 'delete', {
        by: sender || msg.key.participant || msg.key.remoteJid,
        target: ctx.participant,
      });

    } catch (error) {
      console.error('Delete command error:', error);
      return reply(`❌ *${toSmallCaps('erreur')} :* ${error.message}\n\n${extra.phrases.footer()}`);
    }
  }
};
