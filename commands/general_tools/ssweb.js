/**
 * SSWeb - Screenshot Website Command
 * 𝐃𝐚𝐫𝐤 Edition
 */

const axios = require('axios');
const APIs = require('../../utils/api');
const { takeScreenshot } = require('../../utils/screenshotApi');
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

module.exports = {
  name: 'ssweb',
  aliases: ['screenshot', 'ss', 'webss', 'capture'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘʀᴇɴᴅ ᴜɴᴇ ᴄᴀᴘᴛᴜʀᴇ ᴅ\'ᴇᴄʀᴀɴ ᴅ\'ᴜɴ sᴀɴᴄᴛᴜᴀɪʀᴇ ᴡᴇʙ',
  usage: `${config.prefix || '.'}ssweb [lien du site]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId = extra.from;

    try {
      if (args.length === 0) {
        return reply(
          `*⚠️ ${toSmallCaps('echec de l\'invocation')}*\n\n` +
          `*┃* 🔮 *${toSmallCaps('indique ladresse dun sanctuaire web')} !*\n` +
          `*┃* 💡 *${toSmallCaps('exemple')} :* \`.ssweb google.com\`\n\n` +
          extra.phrases.footer()
        );
      }

      let url = args.join(' ');

      // Auto-fix : Ajoute https:// si l'utilisateur l'oublie
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }

      // Petite réaction d'attente
      await sock.sendMessage(chatId, {
        react: { text: '📸', key: msg.key }
      });

      // Appel à l'API
      const screenshotBuffer = await takeScreenshot(url, 'mobile');

      const captionText = 
          `*╭╼≪• 🖼️ ᴠɪsɪᴏɴ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ •≫╾╮*\n` +
          `*┃* 🌐 *${toSmallCaps('source')} :* ${url}\n\n` +
          `*♛ ${toSmallCaps('jesus est roi de ce sanctuaire web')} ♛*\n\n` +
          extra.phrases.footer();

      // Envoi de l'image de capture
      await sock.sendMessage(chatId, {
        image: screenshotBuffer,
        caption: captionText
      }, { quoted: msg });

    } catch (error) {
      console.error('SSWeb command error:', error);
      await reply(`*❌ ${toSmallCaps('erreur')} :* ${toSmallCaps('impossible de capturer ce sanctuaire')} (${error.message})\n\n${extra.phrases.footer()}`);
    }
  }
};
