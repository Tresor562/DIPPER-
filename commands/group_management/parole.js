/**
 * Unmute ( tous les membres peuvent s'exprimer)
 * 𝐃𝐚𝐫𝐤 Edition
 * Sécurité : Supreme Owner Master Access (Invisible Bypass)
 */

const config = require('../../config.js'); 
const modlog = require('../../utils/modlog');

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
  name: 'parole',
  aliases: ['open', 'opengroup', 'unmute', 'ᴘᴀʀᴏʟᴇ'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴏᴜᴠʀᴇ ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ (ᴛᴏᴜs ʟᴇs ᴍᴇᴍʙʀᴇs ᴘᴇᴜᴠᴇɴᴛ ᴘᴀʀʟᴇʀ)',
  usage: `${prefix}parole`, // 💡 Dynamique avec ton préfixe actuel
  groupOnly: true,
  adminOnly: false, // Traitement manuel ci-dessous pour inclure les Maîtres
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, sender, groupMetadata } = extra;

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      const isMe = msg.key.fromMe || isOwner;

      // 🚨 ÉVALUATION DES DROITS
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette incantation est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const chatId = msg.key.remoteJid;

      // Baileys commande pour ouvrir le groupe
      await sock.groupSettingUpdate(chatId, 'not_announcement');

      modlog.addEntry(chatId, 'unmute', {
        by: sender || msg.key.participant || msg.key.remoteJid,
        groupName: groupMetadata?.subject,
      });

      const text = `🔓 *ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ ᴀ ᴇ́ᴛᴇ́ ᴏᴜᴠᴇʀᴛ !*\n\n` +
                   `*${toSmallCaps('tous les membres peuvent desormais s\'exprimer')}* \n\n` +
                   extra.phrases.footer();

      await reply(text);

    } catch (error) {
      console.error('Unmute Command Error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
