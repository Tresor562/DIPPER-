/**
 * Crop Command
 * Crop any sticker/image/video into a perfect square sticker (animated for videos)
 * 𝐃𝐈𝐏𝐏𝐄𝐑  Edition
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const webp = require('node-webpmux');
const config = require('../../config.js');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

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

const getQuotedMessage = (message) =>
  message.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
  message.message?.buttonsResponseMessage?.contextInfo?.quotedMessage ||
  message.message?.listResponseMessage?.contextInfo?.quotedMessage ||
  null;

const resolveMedia = (message) => {
  const messageType = Object.keys(message.message || {})[0];
  if (messageType === 'imageMessage' || messageType === 'stickerMessage' || messageType === 'videoMessage' || messageType === 'documentMessage') {
    return { type: messageType, media: message.message[messageType] };
  }
  const quoted = getQuotedMessage(message);
  if (!quoted) return null;
  const quotedType = Object.keys(quoted || {})[0];
  if (quotedType === 'imageMessage' || quotedType === 'stickerMessage' || quotedType === 'videoMessage' || quotedType === 'documentMessage') {
    return { type: quotedType, media: quoted[quotedType] };
  }
  return null;
};

module.exports = {
  name: 'crop',
  aliases: ['square', 'cropper', 'cisaille', 'cr','c'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏᴜᴘᴇ ᴜɴ sᴛɪᴄᴋᴇʀ/ɪᴍᴀɢᴇ/ᴠɪᴅᴇᴏ ᴇɴ ᴜɴ ᴘᴀʀғᴀɪᴛ sᴛɪᴄᴋᴇʀ ᴄᴀʀʀᴇ (ᴀɴɪᴍᴇ ᴘᴏᴜʀ ʟᴇs ᴠɪᴅᴇᴏs)',
  
  get usage() {
    const activePrefix = config.prefix || '.';
    return `${activePrefix}crop [reponse au media]`;
  },

  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const tmpDir = getTempDir();
    const tempInput = path.join(tmpDir, `temp_${Date.now()}`);
    const tempOutput = path.join(tmpDir, `crop_${Date.now()}.webp`);
    const tempFiles = [tempInput, tempOutput];

    try {
      const messageToQuote = msg;
      let targetMessage = msg;

      // Si le message est une réponse, le média cible est dans le message cité
      if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedInfo = msg.message.extendedTextMessage.contextInfo;
        targetMessage = {
          key: {
            remoteJid: extra.from,
            id: quotedInfo.stanzaId,
            participant: quotedInfo.participant
          },
          message: quotedInfo.quotedMessage
        };
      }

      const mediaInfo = resolveMedia(targetMessage);

      if (!mediaInfo) {
        return reply(`*✂️ ${toSmallCaps('veuillez repondre a un sticker, une image ou une video a tailler')}.*\n\n> *sᴇᴜʟ ᴅᴀɴs ʟ'ᴏᴍʙʀᴇ, ᴊᴀᴍᴀɪs ᴠᴀɪɴᴄᴜ — 𝐃𝐈𝐏𝐏𝐄𝐑 *`);
      }

      const { type, media } = mediaInfo;
      const mediaMessage = media;

      if (!mediaMessage) {
        return reply(`*✂️ ${toSmallCaps('veuillez repondre a un media with .crop, ou l\'envoyer with .crop en legende')}.*\n\n> *sᴇᴜʟ ᴅᴀɴs ʟ'ᴏᴍʙʀᴇ, ᴊᴀᴍᴀɪs ᴠᴀɪɴᴄᴜ — 𝐃𝐈𝐏𝐏𝐄𝐑 *`);
      }

      // Téléchargement du média d'origine
      const mediaBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      if (!mediaBuffer) {
        return reply(`*❌ ${toSmallCaps('echec du telechargement du media. veuillez reessayer')}.*\n\n> *sᴇᴜʟ ᴅᴀɴs ʟ'ᴏᴍʙʀᴇ, ᴊᴀᴍᴀɪs ᴠᴀɪɴᴄᴜ — 𝐃𝐈𝐏𝐏𝐄𝐑 *`);
      }

      // Vérification de la taille du fichier
      if (mediaBuffer.length > MAX_FILE_SIZE) {
        return reply(`*❌ ${toSmallCaps('fichier trop volumineux')} :* ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)\n\n> *sᴇᴜʟ ᴅᴀɴs ʟ'ᴏᴍʙʀᴇ, ᴊᴀᴍᴀɪs ᴠᴀɪɴᴄᴜ — 𝐃𝐈𝐏𝐏𝐄𝐑 *`);
      }

      // Notification d'attente
      await reply(`*☬ ${toSmallCaps('cisaillement en cours')}... ${toSmallCaps('sois patient')}.*`);

      fs.writeFileSync(tempInput, mediaBuffer);

      // Détection des médias animés
      const isAnimated = mediaMessage.mimetype?.includes('gif') || 
                        mediaMessage.mimetype?.includes('video') || 
                        mediaMessage.seconds > 0 ||
                        type === 'videoMessage';

      const fileSizeKB = mediaBuffer.length / 1024;
      const isLargeFile = fileSizeKB > 5000; // Seuil à 5MB

      // Commande de transmutation FFmpeg
      let ffmpegCommand;

      if (isAnimated) {
        if (isLargeFile) {
          ffmpegCommand = `ffmpeg -i "${tempInput}" -t 2 -vf "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=8" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 30 -compression_level 6 -b:v 100k -max_muxing_queue_size 1024 "${tempOutput}"`;
        } else {
          ffmpegCommand = `ffmpeg -i "${tempInput}" -t 3 -vf "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=12" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 50 -compression_level 6 -b:v 150k -max_muxing_queue_size 1024 "${tempOutput}"`;
        }
      } else {
        ffmpegCommand = `ffmpeg -i "${tempInput}" -vf "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,format=rgba" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`;
      }

      await new Promise((resolve, reject) => {
        exec(ffmpegCommand, (error, stdout, stderr) => {
          if (error) {
            console.error('FFmpeg error:', error);
            reject(error);
          } else {
            resolve();
          }
        });
      });

      if (!fs.existsSync(tempOutput)) {
        throw new Error('FFmpeg failed to create output file');
      }

      const outputStats = fs.statSync(tempOutput);
      if (outputStats.size === 0) {
        throw new Error('FFmpeg created empty output file');
      }

      let webpBuffer = fs.readFileSync(tempOutput);

      // Injection des métadonnées Exif
      const img = new webp.Image();
      await img.load(webpBuffer);

      const json = {
        'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
        'sticker-pack-name': config.packname || '𝐃𝐈𝐏𝐏𝐄𝐑 ',
        'emojis': ['✂️']
      };

      const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
      const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
      const exif = Buffer.concat([exifAttr, jsonBuffer]);
      exif.writeUIntLE(jsonBuffer.length, 14, 4);

      img.exif = exif;

      const finalBuffer = await img.save(null);

      // Envoi du sticker rogné
      await sock.sendMessage(extra.from, { 
        sticker: finalBuffer
      }, { quoted: messageToQuote });

    } catch (error) {
      console.error('Crop command error:', error);
      await reply(`*❌ ${toSmallCaps('echec du sectionnement. tentez avec une image ou video plus courte')}.*\n\n> *sᴇᴜʟ ᴅᴀɴs ʟ'ᴏᴍʙʀᴇ, ᴊᴀᴍᴀɪs ᴠᴀɪɴᴄᴜ — 𝐃𝐈𝐏𝐏𝐄𝐑 *`);
    } finally {
      tempFiles.forEach(file => deleteTempFile(file));
    }
  }
};
