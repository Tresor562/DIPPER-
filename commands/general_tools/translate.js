/**
 * Translate Command - Translate text to different languages
 * 𝐃𝐚𝐫𝐤 Edition
 */

const APIs = require('../../utils/api');
const config = require('../../config.js');

function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  const cleanedText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

const prefix = config.prefix || '.';

module.exports = {
  name: 'traduction',
  aliases: ['traduire'],
  category: '🛠️ Outils généraux', 
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪɴᴠᴏǫᴜᴇ ʟᴀ sᴀɢᴇssᴇ ᴅᴇs ʟᴀɴɢᴜᴇs ᴘᴏᴜʀ ᴛʀᴀᴅᴜɪʀᴇ ᴜɴ ᴍᴜʀᴍᴜʀᴇ',
  usage: `${prefix}tr [langue] [texte ou en reponse]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;

    try { 
      let targetLang = 'fr'; // Langue par défaut
      let text = '';

      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;

      if (quoted) {
        text = quoted.conversation || 
               quoted.extendedTextMessage?.text || 
               quoted.imageMessage?.caption || 
               quoted.videoMessage?.caption || '';

        if (args[0] && args[0].length <= 5) {
          targetLang = args[0].toLowerCase();
        }
      } else {
        if (args.length >= 2 && args[0].length <= 3) {
          targetLang = args[0].toLowerCase();
          text = args.slice(1).join(' ');
        } else if (args.length >= 1) {
          targetLang = 'fr';
          text = args.join(' ');
        }
      }

      if (!text || text.trim() === '') {
        return reply(
          `*⚠️ ${toSmallCaps('usage')} :* \`${prefix}tr <${toSmallCaps('langue')}> <${toSmallCaps('texte')}>\`\n\n` +
          `*${toSmallCaps('exemple')} :* \`${prefix}tr en bonjour\`\n\n` +
          extra.phrases.footer()
        );
      }

      await reply(`*☬ ${toSmallCaps('invocation des arcanes linguistiques')}...*`);

      // Appel à l'API de ton Sanctuaire
      const result = await APIs.translate(text, targetLang);
      const translatedText = result.translation || result;

      // Style d'affichage unifié comme Bouffon / Aveu
      const styledReflet = toSmallCaps(translatedText);

      const replyText = 
          `*${toSmallCaps('reflet symbolique')} (${targetLang.toUpperCase()}) :*\n\n` +
          `*${styledReflet}*\n\n` +
          extra.phrases.footer();

      await reply(replyText);

    } catch (error) {
      console.error('Translate Error:', error);
      await reply(`*❌ ${toSmallCaps('erreur')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};