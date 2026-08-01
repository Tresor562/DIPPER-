/**
 * Sticker to Image/Video - Convert sticker to PNG or MP4
 * 𝐃𝐚𝐫𝐤  Edition
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config.js');
const fs = require('fs');
const path = require('path');
const tempManager = require('../../utils/tempManager');

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
  name: 'image',
  aliases: ['toimg', 'stickertoimg', 'sticker2img', 'svideo', 'simage', 'img', 'tovideo', 'tovideo+'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴᴠᴇʀᴛɪᴛ ᴜɴ sᴛɪᴄᴋᴇʀ ᴇɴ ɪᴍᴀɢᴇ (ᴘɴɢ) ᴏᴜ ᴇɴ ᴠɪᴅᴇᴏ',
  
  get usage() {
    const activePrefix = config.prefix || '.';
    return `${activePrefix}image [reponse sticker fixe]\n` +
           `${activePrefix}tovideo [reponse sticker anime]`;
  },
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId = extra.from;

    try {
      const notStickerMessage = `⚠️ *${toSmallCaps('repondez a un sticker pour enclencher la transmutation d\'origine')}.*`;

      // 1. Vérification isolée du message cité
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctxInfo?.quotedMessage) {
        return await reply(notStickerMessage);
      }

      const targetMessage = {
        key: {
          remoteJid: chatId,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
        message: ctxInfo.quotedMessage,
      };

      // 2. Vérification s'il s'agit bien d'un sticker
      const stickerMessage = targetMessage.message?.stickerMessage;
      if (!stickerMessage) {
        return await reply(notStickerMessage);
      }

      await sock.sendPresenceUpdate('composing', chatId);

      // 3. Téléchargement du média WebP d'origine
      const stickerBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage },
      );

      if (!stickerBuffer) {
        return await reply(`*❌ ${toSmallCaps('echec de l\'invocation : impossible de saisir le sticker')}*`);
      }

      // 4. Détection du type de sticker (Fixe vs Animé)
      const isAnimated = stickerMessage.isAnimated || stickerMessage.mimetype?.includes('animated');

      if (isAnimated) {
        // --- TRANSFORMATION EN VIDÉO (Animated Sticker) ---
        const { webp2mp4 } = require('../../utils/webp2mp4'); 
        
        // On crée un fichier temporaire pour que l'API wep2mp4 l'accepte à coup sûr
        // [PHASE 2 — SUITE] Isolation par session — voir utils/tempManager.js
        const tempWebp = tempManager.createTempFilePath('sticker', 'webp');
        fs.writeFileSync(tempWebp, stickerBuffer);

        const mp4Buffer = await webp2mp4(tempWebp);
        
        // Nettoyage du fichier temporaire
        if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);

        if (!mp4Buffer || mp4Buffer.length === 0) {
          throw new Error('Le buffer MP4 est vide ou nul');
        }

        // Envoi sous forme de vidéo/GIF cyclique
        await sock.sendMessage(chatId, {
          video: mp4Buffer,
          mimetype: 'video/mp4',
          gifPlayback: true
        }, { quoted: msg });

      } else {
        // --- TRANSFORMATION EN IMAGE (Static Sticker) ---
        // Utilisation de SHARP pour une conversion instantanée et sans API externe
        const sharp = require('sharp');
        
        const imageBuffer = await sharp(stickerBuffer)
          .png()
          .toBuffer();

        // Envoi sous forme d'image
        await sock.sendMessage(chatId, {
          image: imageBuffer
        }, { quoted: msg });
      }

    } catch (error) {
      console.error('Error in image command:', error);
      await reply(`*❌ ${toSmallCaps('echec de la conversion du sticker')} :* ${error.message}\n\n> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`);
    }
  }
};
