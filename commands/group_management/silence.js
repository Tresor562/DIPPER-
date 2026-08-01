/**
 * Mute Command - Close group (only admins can send)
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
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
  name: 'silence',
  aliases: ['close', 'closegroup', 'mute', 'sɪʟᴇɴᴄᴇ'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sᴄᴇʟʟᴇ ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ (sᴇᴜʟs ʟᴇs ᴀᴅᴍɪɴs ᴘᴀʀʟᴇɴᴛ)',
  usage: `${prefix}silence`, // 💡 Dynamique avec ton préfixe actuel
  groupOnly: true,
  adminOnly: false, // Traitement manuel ci-dessous pour inclure les Maîtres
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, sender, groupMetadata } = extra;

    try {
      // 🛡️ SÉCURITÉ GÉRÉE PAR LE HANDLER
      const isMe = msg.key.fromMe || isOwner;

      // Si l'utilisateur n'est pas admin et n'est pas listé comme Owner
      if (!isMe && !isAdmin) {
        return reply(`*❌ ${toSmallCaps('cette incantation est reservee aux administrateurs du sanctuaire')} !*\n\n${extra.phrases.footer()}`);
      }

      const chatId = msg.key.remoteJid;

      // Baileys commande pour fermer le groupe
      await sock.groupSettingUpdate(chatId, 'announcement');

      modlog.addEntry(chatId, 'mute', {
        by: sender || msg.key.participant || msg.key.remoteJid,
        groupName: groupMetadata?.subject,
      });

      const text = `🔒 *ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ ᴀ ᴇ́ᴛᴇ́ sᴄᴇʟʟᴇ́ !*\n\n` +
                   `*🔮 ${toSmallCaps('seuls les gardiens du sanctuaire peuvent desormais s\'exprimer')}.* \n\n` +
                   extra.phrases.footer();

      await reply(text);

    } catch (error) {
      console.error('Mute Command Error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
