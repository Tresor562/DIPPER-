/**
 * Translate Command - 𝐃𝐚𝐫𝐤 Edition
 * Traduit des textes dans le sanctuaire (Mode Brut)
 */

const fetch = require('node-fetch');
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

module.exports = {
  name: 'translate',
  aliases: ['tr', 'trans', 'trad', 'gt_traduis', 'gt_traduire'], 
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴛʀᴀᴅᴜɪᴛ ᴅᴇs ᴛᴇxᴛᴇs ᴇᴛ ɪɴᴄᴀɴᴛᴀᴛɪᴏɴs (ᴍᴏᴅᴇ ʙʀᴜᴛ)',

  get usage() {
    const activePrefix = config.prefix || '.';
    return `${activePrefix}tr <lang> <texte> ou en reponse : ${activePrefix}tr <lang>`;
  },

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    try {
      const chatId = msg.key.remoteJid;
      const activePrefix = config.prefix || '.';
      await sock.sendPresenceUpdate('composing', chatId);

      let textToTranslate = '';
      let lang = '';
      const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (quotedMessage) {
        textToTranslate = quotedMessage.conversation || 
                         quotedMessage.extendedTextMessage?.text || 
                         quotedMessage.imageMessage?.caption || 
                         quotedMessage.videoMessage?.caption || '';
        lang = args[0]?.toLowerCase().trim();
      } else {
        if (args.length < 2) {
          return await reply(
            `*⚠️ ${toSmallCaps('usage')} :*\n` +
            `1. ${toSmallCaps('reponds a un message avec')} : \`${activePrefix}tr <ʟᴀɴɢ>\`\n` +
            `2. ${toSmallCaps('ou tape')} : \`${activePrefix}tr <ʟᴀɴɢ> <ᴛᴇxᴛᴇ>\`\n\n` +
            `📜 ${toSmallCaps('exemple')} : ${activePrefix}tr fr hello\n\n` +
            extra.phrases.footer()
          );
        }
        lang = args[0].toLowerCase();
        textToTranslate = args.slice(1).join(' ');
      }

      if (!textToTranslate || !lang) {
        return await reply(`*❌ ${toSmallCaps('aucun texte ou langue detecte')} !*\n\n${extra.phrases.footer()}`);
      }

      let translatedText = "";

      // 🌐 API 1 : Google Translate (Arbres de tableaux)
      try {
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(textToTranslate)}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data[0]) {
            // 🛠️ FIX : On boucle sur toutes les lignes pour ne rater aucun paragraphe !
            data[0].forEach(line => {
              if (line[0]) translatedText += line[0];
            });
          }
        }
      } catch (e) {
        translatedText = ""; // On reset pour la suite
      }

      // 🌐 API 2 : MyMemory (Backup)
      if (!translatedText) {
        try {
          const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=auto|${lang}`);
          if (response.ok) {
            const data = await response.json();
            if (data?.responseData?.translatedText) {
              translatedText = data.responseData.translatedText;
            }
          }
        } catch (e) {}
      }

      if (!translatedText) {
        return await reply(`*❌ ${toSmallCaps('l oracle a echoue a traduire ce texte')}...*\n\n${extra.phrases.footer()}`);
      }

      // Renvoi brut de la traduction
      await reply(`${translatedText}`);

    } catch (error) {
      console.error('Error in translate command:', error);
      await reply(`*❌ ${toSmallCaps('l oracle a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
