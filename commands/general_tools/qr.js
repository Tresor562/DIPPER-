/**
 * QR Code Generator Command
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

const qrcode = require('qrcode');
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
  name: 'reflet',
  aliases: ['qrcode', 'qr'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɢᴇɴᴇʀᴇ ᴜɴ sᴄᴇᴀᴜ ǫʀ ᴀ ᴘᴀʀᴛɪʀ ᴅ\'ᴜɴ ᴛᴇxᴛᴇ',
  usage: `${config.prefix || '.'}reflet [texte]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;

    try {
      const prefix = config.prefix || '.';

      // 1. Validation de l'argument
      if (args.length === 0) {
        return reply(
          `*⚠️ ${toSmallCaps('echec de l\'invocation')}*\n\n` +
          `*┃* 🔮 *${toSmallCaps('indique le texte a materialiser')} !*\n` +
          `*┃* 💡 *${toSmallCaps('exemple')} :* \`${prefix}reflet ${toSmallCaps('truth devices')}\`\n\n` +
          extra.phrases.footer()
        );
      }

      const text = args.join(' ');

      // 2. Génération du QR Code mystique
      const qrBuffer = await qrcode.toBuffer(text, {
        type: 'png',
        width: 500,
        margin: 2
      });

      // 3. Envoi du sceau généré
      await sock.sendMessage(extra.from, {
        image: qrBuffer,
        caption: `*╭╼≪• ✅ ǫʀ ᴍᴀᴛᴇʀɪᴀʟɪsᴇ •≫╾╮*\n` +
                 `*┃* 📝 *${toSmallCaps('cible')} :* ${text}\n\n` +
                 extra.phrases.footer()
      }, { quoted: msg });

    } catch (error) {
      console.error('QR Code Command Error:', error);
      await reply(`*❌ ${toSmallCaps('erreur')} :* ${toSmallCaps('le sceau n\'a pas pu etre forge')} (${error.message})\n\n${extra.phrases.footer()}`);
    }
  }
};
