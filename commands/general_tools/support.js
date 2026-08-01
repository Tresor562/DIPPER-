/**
 * Support Command - Display project links and developer contact
 * 𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

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
  name: 'support',
  aliases: ['group', 'sup','assistance', 'links', 'liens', 'contact'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀғғɪᴄʜᴇ ʟᴇs ʟɪᴇɴs ᴅᴇs sᴀɴᴄᴛᴜᴀɪʀᴇs ᴇᴛ ʟᴇ ᴄᴏɴᴛᴀᴄᴛ ᴅᴜ ᴍᴀɪᴛʀᴇ',
  usage: `${config.prefix || '.'}support`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId = msg.key.remoteJid;

    try {
      // Construction du message avec ton identité visuelle et un ton motivant
      const supportText = 
          `*╭╼≪• ⚡ 𝐃𝐈𝐏𝐏𝐄𝐑  sᴜᴘᴘᴏʀᴛ •≫╾╮*\n` +
          `*┃* 🔮 *${toSmallCaps('rejoignez la legende')} !*\n` +
          `*┃* *${toSmallCaps('ne restez pas dans lombre')}...* 🌌\n` +
          `*┃* *${toSmallCaps('entrez dans nos cercles pour')}*\n` +
          `*┃* *${toSmallCaps('maitriser la puissance du bot')} !*\n\n` +

          `*🔗 ${toSmallCaps('nos sanctuaires')}*\n` +
          `*┃* 📢 *${toSmallCaps('chaine telegram')} :* (⚡ *${toSmallCaps('exclusivites')}*)\n` +
          `*┃* 👉🏾 https://t.me/darkxbot\n` +
          `*┃*\n` +
          `*┃* 🟢 *${toSmallCaps('chaine whatsapp')} :* (🔥 *${toSmallCaps('mises a jour')}*)\n` +
          `*┃* 👉🏾 https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V\n` +
          `*┃*\n` +
          `*┃* 💬 *${toSmallCaps('groupe dentraide')} :* (🫂 *${toSmallCaps('la famille')}*)\n` +
          `*┃* 👉🏾 https://chat.whatsapp.com/IFUx2XwT55o6yHqmaKf3DW\n\n` +

          `*👑 ${toSmallCaps('le grand maitre')}*\n` +
          `*┃* 👤 *${toSmallCaps('createur')} :* Trésor\n` +
          `*┃* 📱 *${toSmallCaps('contact prive')} :* https://wa.me/2290146202259\n` +
          `*┃* 📱 *${toSmallCaps('contact prive')} :* https://wa.me/2290155745907\n\n` +

          `_ ♛ ᴊᴇsᴜs ᴇsᴛ ᴍᴀɪᴛʀᴇ sᴜᴘʀᴇᴍᴇ ᴅᴇ ᴄᴇ ᴍᴏᴜᴠᴇᴍᴇɴᴛ ♛_\n\n` +
          extra.phrases.footer();

      // Envoi du message avec la configuration d'officialisation (Newsletter)
      await sock.sendMessage(chatId, {
        text: supportText,
        contextInfo: {
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363411005383995@newsletter',
            newsletterName: '𝐃𝐈𝐏𝐏𝐄𝐑',
            serverMessageId: -1
          }
        }
      }, { quoted: msg });

    } catch (error) {
      console.error('Support command error:', error);
      await reply(`*❌ ${toSmallCaps('les liens du sanctuaire sont inaccessibles')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
