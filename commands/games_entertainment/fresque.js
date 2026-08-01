/**
 * fresque - Envoie des memes
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

const APIs = require('../../utils/api');
const axios = require('axios');
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
  name: 'fresque',
  aliases: ['fresque_memes', 'meme'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇxᴘʟᴏʀᴇ ʟᴀ ᴍᴀᴛʀɪᴄᴇ ᴇᴛ ʀᴇᴄᴜᴘᴇʀᴇ ᴜɴᴇ ғʀᴇsǫᴜᴇ (ᴍᴇᴍᴇ) ᴀʟᴇᴀᴛᴏɪʀᴇ',
  usage: `${prefix}fresque`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const from = extra.from;

    try {
      // Invocation du meme via ton utilitaire API
      const meme = await APIs.getMeme();

      // Téléchargement de l'image de la fresque
      const imageBuffer = await axios.get(meme.url, { responseType: 'arraybuffer' });

      // Stylisation des textes
      const subFormatted = toSmallCaps(meme.subreddit);
      const authorFormatted = toSmallCaps(meme.author);

      const caption = `🎭 *${meme.title.toUpperCase()}*\n\n` +
                      `🌐 *${toSmallCaps('dimension')} : ʀ/${subFormatted}*\n` +
                      `👤 *${toSmallCaps('createur')} : ${authorFormatted}*\n` +
                      `⚡ *${toSmallCaps('flux d\'energie')} : ${meme.ups}*\n\n` +
                      extra.phrases.footer();

      await sock.sendMessage(from, {
        image: Buffer.from(imageBuffer.data),
        caption: caption
      }, { quoted: msg });

    } catch (error) {
      console.error('Meme Error:', error);
      await reply(`*❌ ${toSmallCaps('l\'extraction de la fresque a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
