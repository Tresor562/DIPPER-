/**
 * Small Caps Command - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Convertit un texte normal en petites capitales ésotériques
 */
const config = require ('../../config.js');
const prefix = config.prefix || '.';
module.exports = {
  name: 'sᴍᴀʟʟᴄᴀᴘs',
  aliases: ['sc_caps', 'sc_police', 'sc_style', 'sc_smallcaps'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴛʀᴀɴsғᴏʀᴍᴇ ᴜɴ ᴛᴇxᴛᴇ ᴇɴ ᴘᴇᴛɪᴛᴇs ᴄᴀᴘɪᴛᴀʟᴇs',
  usage: `${prefix}sᴍᴀʟʟᴄᴀᴘs <ᴛᴇxᴛᴇ> ᴏᴜ ᴇɴ ʀᴇ́ᴘᴏɴsᴇ ᴀ̀ ᴜɴ ᴍᴇssᴀɢᴇ`,
  
  async execute(sock, msg, args, extra) {
    const { reply } = extra;

    try {
      let textToConvert = '';

      // 1. Extraction du texte (Si réponse ou arguments)
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quotedMsg) {
        textToConvert = quotedMsg.conversation || 
                        quotedMsg.extendedTextMessage?.text || 
                        quotedMsg.imageMessage?.caption ||
                        quotedMsg.videoMessage?.caption ||
                        '';
      } else {
        textToConvert = args.join(' ');
      }

      textToConvert = textToConvert.trim();

      // Validation
      if (!textToConvert) {
        return reply('*⚠️ ᴍᴜʀᴍᴜʀᴇ ᴜɴ ᴛᴇxᴛᴇ ᴀᴘʀᴇ̀s ʟᴀ ᴄᴏᴍᴍᴀɴᴅᴇ ᴏᴜ ʀᴇ́ᴘᴏɴᴅs ᴀ̀ ᴜɴ ᴍᴇssᴀɢᴇ !*');
      }

      // 2. Fonction de conversion magique
      const normal = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
      
      const convertedText = textToConvert.split('').map(char => {
        const index = normal.indexOf(char);
        return index !== -1 ? smallCaps[index] : char;
      }).join('');

      // 3. Envoi du message converti
      await reply(`*${convertedText}*`);

    } catch (error) {
      console.error('[smallcaps] ERROR:', error);
      await reply(`❌ *ᴇʀʀᴇᴜʀ :* ${error.message}`);
    }
  }
};
