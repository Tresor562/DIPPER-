/**
 * TTS - Text to Speech Command
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

const axios = require('axios'); 
const APIs = require('../../utils/api');
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
  name: 'tts',
  aliases: ['speak', 'say', 'murmure'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪɴᴠᴏǫᴜᴇ ᴜɴᴇ ᴠᴏɪx ᴘᴏᴜʀ ᴘʀᴏɴᴏɴᴄᴇʀ ᴠᴏs ᴍᴜʀᴍᴜʀᴇs (ᴛᴛs)',
  usage: `${config.prefix || '.'}tts [texte ou en reponse]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, from } = extra; // 🛠️ FIX 1 : Récupération sécurisée de 'from'
    const chatId = from || msg.key.remoteJid;

    try {
      let text = args.join(' ');

      // Extraction propre et isolée du texte cité avant toute autre action
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!text && ctx?.quotedMessage) {
        const quoted = ctx.quotedMessage;
        text = quoted.conversation || 
               quoted.extendedTextMessage?.text || 
               quoted.imageMessage?.caption || 
               quoted.videoMessage?.caption || 
               '';
      }

      const prefix = config.prefix || '.';

      // Validation si aucun texte n'est extrait
      if (!text || text.trim() === '') {
        return await reply(
          `*⚠️ ${toSmallCaps('echec de l\'invocation')}*\n\n` +
          `*┃* 🔮 *${toSmallCaps('indique un murmure a materialiser')} !*\n` +
          `*┃* 💡 *${toSmallCaps('exemple')} :* \`${prefix}tts ${toSmallCaps('bonjour le sanctuaire')}\`\n\n` +
          extra.phrases.footer()
        ); 
      }

      // Message d'attente d'invocation
      await reply(`*🔮 ${toSmallCaps('materialisation de la voix en cours')}...*`);

      // Appel à ton utilitaire API
      const audioData = await APIs.textToSpeech(text);

      let audioBuffer;
      if (Buffer.isBuffer(audioData)) {
        audioBuffer = audioData;
      } else {
        const audioResponse = await axios.get(audioData, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        audioBuffer = Buffer.from(audioResponse.data);
      }

      // 🛠️ FIX 2 : On s'assure d'envoyer l'audio au format ogg si possible, sinon on laisse faire l'envoi brut
      await sock.sendMessage(chatId, {
        audio: audioBuffer,
        mimetype: 'audio/ogg; codecs=opus', 
        ptt: false // ptt: true transforme l'audio en véritable note vocale WhatsApp
      }, { quoted: msg });

    } catch (error) {
      console.error('TTS command error:', error);
      await reply(
        `*❌ ${toSmallCaps('echec de l\'illusion')}*\n\n` +
        `*┃* 🥀 *${toSmallCaps('limpossible s est produit')}...*\n` +
        `*┃* ⚠️ *${toSmallCaps('erreur')} :* ${error.message}\n\n` +
        extra.phrases.footer()
      );
    }
  }
};
