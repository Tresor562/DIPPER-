/**
 * Set PP Command - 𝐃𝐚𝐫𝐤 Edition
 * Modifie la photo de profil de l'Oracle
 * */

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config.js');

// Fonction pour le style Small Caps (Cohérence visuelle du sanctuaire)
function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

  const cleanedText = String(text).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 

  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

const prefix = config.prefix || '.';

// Max file size: 10MB for profile pictures
const MAX_FILE_SIZE = 10 * 1024 * 1024;

module.exports = {
  name: 'empreinte_grimoire',
  aliases: ['setimage', 'setprofilepicture', 'setoraclepp', 'setoracledp', 'avatar', 'setpp'],
  category: '👑 Owner',
  ownerOnly: false, // Géré manuellement par hasAccess via isOwner
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴛʀᴀɴsᴍᴜᴛᴇ ʟ\'ɪᴍᴀɢᴇ ᴅᴇ ᴘʀᴏғɪʟ ᴅᴜ ᴄᴏᴍᴍᴀɴᴅᴇᴜʀ ᴀ̀ ᴘᴀʀᴛɪʀ ᴅ\'ᴜɴᴇ ɪᴍᴀɢᴇ',
  usage: `${prefix}empreinte_grimoire`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;

    try {
      // 🛡️ BLINDAGE GHOSTG : Sécurité absolue
      const hasAccess = isOwner === true;

      // Seul le cercle des maîtres peut manipuler l'empreinte de l'Oracle
      if (!hasAccess) {
        return reply(`*❌ ${toSmallCaps('tu n\'as pas l\'autorisation supreme pour invoquer cette puissance')}.*\n\n${extra.phrases.footer()}`);
      }

      // On vérifie si le message est une réponse
      const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quotedMessage) {
        return reply(`*⚠️ ${toSmallCaps('murmure cette commande en reponse a une image')} !*\n\n${extra.phrases.footer()}`);
      }

      // Check if quoted message contains an image
      const imageMessage = quotedMessage.imageMessage;

      if (!imageMessage) {
        return reply(`*〆 ${toSmallCaps('l\'aura citee doit obligatoirement etre une image')} !*\n\n${extra.phrases.footer()}`);
      }

      try {
        await reply(`*🔮 ${toSmallCaps('l\'oracle procede a l\'aspiration de l\'aura')}... ${toSmallCaps('patiente')}.*`);

        // Download the media
        const stream = await downloadContentFromMessage(imageMessage, 'image');
        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }

        // Check file size
        if (buffer.length > MAX_FILE_SIZE) {
          return reply(`*〆 ${toSmallCaps('cet artefact est trop lourd')} : ${(buffer.length / 1024 / 1024).toFixed(2)}MB (ᴍᴀx : ${MAX_FILE_SIZE / 1024 / 1024}MB)*\n\n${extra.phrases.footer()}`);
        }

        // Set the profile picture directement par buffer
        const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.updateProfilePicture(botJid, buffer);

        await reply(`*✅ ${toSmallCaps('l\'empreinte visuelle du sanctuaire a ete transmutee avec succes')} !*\n\n${extra.phrases.footer()}`);
      } catch (error) {
        console.error('setbotpp error inside:', error);
        await reply(`*〆 ${toSmallCaps('l\'oracle a echoue a modifier l\'empreinte visuelle')}.*\n\n${extra.phrases.footer()}`);
      }
    } catch (error) {
      console.error('setbotpp global error:', error);
      await reply(`*〆 ${toSmallCaps('l\'oracle a echoue a modifier l\'empreinte visuelle')}.*\n\n${extra.phrases.footer()}`);
    }
  }
};
