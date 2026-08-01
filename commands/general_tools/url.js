/**
 * Media to URL Converter - Catbox Edition
 * Style by -ّ⸙𓆩ɢʜᴏsᴛɢ 𝐗 𓆪⸙-ّ
 */
const config = require('../../config.js');
const prefix = config.prefix || '.';
const axios = require('axios');
const FormData = require('form-data');
const { fileTypeFromBuffer } = require('file-type');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'tourl',
  aliases: ['url', 'makeurl', 'upload', 'catbox'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴᴠᴇʀᴛɪᴛ ᴜɴ ᴍᴇᴅɪᴀ ᴇɴ ʟɪᴇɴ ᴜʀʟ ᴘᴜʙʟɪᴄ ᴠɪᴀ ᴄᴀᴛʙᴏx',
  usage: `${prefix}tourl (répondez à une image/vidéo/audio)`,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId = msg.key.remoteJid;

    try {
      // 🛠️ FIX 1 : Récupération propre du message cité
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      
      if (!quoted) {
        return reply('⚠️ *Reponds a un media valide (Image / Video / Audio).*');
      }

      // 🛠️ FIX 2 : Détection stricte du type de média
      const mediaType = Object.keys(quoted).find(key => 
        key.endsWith('Message') && !key.startsWith('senderKey')
      );

      const supportedTypes = [
        'imageMessage', 'videoMessage', 'audioMessage', 
        'stickerMessage', 'documentMessage'
      ];

      if (!mediaType || !supportedTypes.includes(mediaType)) {
        return reply('❌ *Format non pris en charge. Reponds a un vrai media.*');
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

      // 🛠️ FIX 3 : Téléchargement direct et robuste sans passer par "extra"
      const messageToDownload = quoted[mediaType];
      const stream = await downloadContentFromMessage(
        messageToDownload, 
        mediaType.replace('Message', '')
      );
      
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (!buffer || buffer.length === 0) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
        return reply('❌ *Echec du telechargement du media depuis WhatsApp.*');
      }

      const fileType = await fileTypeFromBuffer(buffer);
      const ext = fileType ? fileType.ext : 'bin';

      let mediaUrl;
      try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buffer, { filename: `ghostgx.${ext}` });

        const response = await axios.post('https://catbox.moe/user/api.php', form, {
          headers: { ...form.getHeaders() }
        });

        if (response.data && typeof response.data === 'string') {
          mediaUrl = response.data.trim();
        } else {
          throw new Error('Reponse invalide de Catbox');
        }
      } catch (uploadErr) {
        console.error('Catbox Upload Error:', uploadErr.message);
        await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
        return reply('❌ *Erreur lors de l\'hebergement sur Catbox.*');
      }

      // Design ténébreux avec ton sceau obligatoire
      const caption = 
        `🌐 *ʟɪᴇɴ :* ${mediaUrl}\n\n` +
        extra.phrases.footer();

      // 🛠️ FIX 4 : Aperçu personnalisé ultra-pro
      const adReplyOptions = {
        title: "𝐃𝐈𝐏𝐏𝐄𝐑",
        body: "Conversion terminee.",
        sourceUrl: mediaUrl,
        mediaType: 1
      };

      // Si c'est une image, on utilise l'image comme miniature
      if (mediaType === 'imageMessage') {
        adReplyOptions.thumbnail = buffer;
      }

      // Envoi du message avec encart d'aperçu
      await sock.sendMessage(chatId, {
        text: caption,
        contextInfo: {
          externalAdReply: adReplyOptions
        }
      }, { quoted: msg });

      await sock.sendMessage(chatId, { react: { text: '🔗', key: msg.key } });

    } catch (error) {
      console.error('ToURL Global Error:', error);
      await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
      await reply('❌ *Une erreur inattendue est survenue.*');
    }
  }
};
