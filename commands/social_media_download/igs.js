/**
 * Instagram to Sticker Commands - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * igs - Convert Instagram media to sticker (with padding, maintains aspect ratio)
 * igsc - Convert Instagram media to cropped square sticker
 */

const { igdl } = require('ruhend-scraper');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const webp = require('node-webpmux');
const crypto = require('crypto');
const config = require('../../config');
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

// Extract Instagram CDN URL from proxy JWT token
function extractInstagramUrl(proxyUrl) {
  try {
    const urlObj = new URL(proxyUrl);
    const token = urlObj.searchParams.get('token');
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length < 2) return null;

    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

    if (payload.url && typeof payload.url === 'string' && payload.url.startsWith('http')) {
      return payload.url;
    }
  } catch (e) {
    // If decoding fails, return null
  }
  return null;
}

// Pick the best URL from media object
function pickMediaUrl(media) {
  if (!media) return null;

  const candidates = [
    media.downloadUrl,
    media.url,
    media.original,
    media.mediaUrl,
    media.videoUrl,
    media.imageUrl,
    media.urls?.[0]
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string' && candidate.startsWith('http')) {
      if (candidate.includes('rapidcdn.app') && candidate.includes('token=')) {
        const instagramUrl = extractInstagramUrl(candidate);
        if (instagramUrl) {
          return instagramUrl;
        }
      }
      return candidate;
    }
  }
  return null;
}

// Convert buffer to sticker webp
async function convertBufferToStickerWebp(inputBuffer, isAnimated, cropSquare) {
  if (inputBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(inputBuffer.length / 1024 / 1024).toFixed(2)}MB`);
  }

  const tmpDir = getTempDir();
  const tempInputBase = path.join(tmpDir, `igs_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tempInput = isAnimated ? `${tempInputBase}.mp4` : `${tempInputBase}.jpg`;
  const tempOutput = path.join(tmpDir, `igs_out_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`);

  const tempFiles = [tempInput, tempOutput];

  try {
    fs.writeFileSync(tempInput, inputBuffer);

    const vfCropSquareImg = "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512";
    const vfPadSquareImg = "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000";

    let ffmpegCommand;
    if (isAnimated) {
      if (cropSquare) {
        ffmpegCommand = `ffmpeg -y -i "${tempInput}" -t 2 -vf "crop=min(iw\\,ih):min(iw\\,ih),scale=512:512,fps=6" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 25 -compression_level 6 -b:v 60k -max_muxing_queue_size 1024 "${tempOutput}"`;
      } else {
        ffmpegCommand = `ffmpeg -y -i "${tempInput}" -t 2 -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,fps=6" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 25 -compression_level 6 -b:v 60k -max_muxing_queue_size 1024 "${tempOutput}"`;
      }
    } else {
      const vf = `${cropSquare ? vfCropSquareImg : vfPadSquareImg},format=rgba`;
      ffmpegCommand = `ffmpeg -y -i "${tempInput}" -vf "${vf}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 60 -compression_level 6 "${tempOutput}"`;
    }

    await new Promise((resolve, reject) => {
      exec(ffmpegCommand, (error) => error ? reject(error) : resolve());
    });

    let webpBuffer = fs.readFileSync(tempOutput);

    // Progressive compression
    let attempts = 0;
    const maxAttempts = 8;
    while (webpBuffer.length > 950 * 1024 && attempts < maxAttempts) {
      attempts++;
      try {
        const tempOutput2 = path.join(tmpDir, `igs_out${attempts}_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`);
        tempFiles.push(tempOutput2);
        let harsherCmd;

        if (isAnimated) {
          const fps = Math.max(3, 6 - attempts);
          const quality = Math.max(10, 25 - (attempts * 3));
          const bitrate = Math.max(30, 60 - (attempts * 5));
          const duration = Math.max(0.5, 2 - (attempts * 0.25));
          const size = attempts <= 2 ? 512 : (attempts <= 4 ? 400 : (attempts <= 6 ? 320 : 256));

          if (cropSquare) {
            harsherCmd = `ffmpeg -y -i "${tempInput}" -t ${duration} -vf "crop=min(iw\\,ih):min(iw\\,ih),scale=${size}:${size},fps=${fps}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality ${quality} -compression_level 6 -b:v ${bitrate}k -max_muxing_queue_size 1024 "${tempOutput2}"`;
          } else {
            harsherCmd = `ffmpeg -y -i "${tempInput}" -t ${duration} -vf "scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#00000000,fps=${fps}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality ${quality} -compression_level 6 -b:v ${bitrate}k -max_muxing_queue_size 1024 "${tempOutput2}"`;
          }
        } else {
          const quality = Math.max(30, 60 - (attempts * 5));
          const size = attempts === 1 ? 512 : (attempts === 2 ? 400 : (attempts === 3 ? 320 : (attempts === 4 ? 256 : 200)));
          const vf = cropSquare
            ? `crop=min(iw\\,ih):min(iw\\,ih),scale=${size}:${size},format=rgba`
            : `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#00000000,format=rgba`;
          harsherCmd = `ffmpeg -y -i "${tempInput}" -vf "${vf}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality ${quality} -compression_level 6 "${tempOutput2}"`;
        }

        await new Promise((resolve, reject) => {
          exec(harsherCmd, (error) => error ? reject(error) : resolve());
        });

        if (fs.existsSync(tempOutput2)) {
          webpBuffer = fs.readFileSync(tempOutput2);
        }
      } catch (e) {
        if (attempts >= maxAttempts) break;
      }
    }

    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
      'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
      'sticker-pack-name': config.packname || '𝐃𝐈𝐏𝐏𝐄𝐑',
      'emojis': ['📸']
    };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);
    img.exif = exif;

    return await img.save(null);
  } finally {
    tempFiles.forEach(file => deleteTempFile(file));
  }
}

// Fetch buffer from URL with validation and retry logic
async function fetchBufferFromUrl(url) {
  const maxRetries = 3;
  const standardHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*'
  };
  const instagramHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com'
  };

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const headers = attempt === 0 ? standardHeaders : instagramHeaders;
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: headers,
        timeout: 30000
      });
      return Buffer.from(res.data);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));
      }
    }
  }
  throw lastError;
}

// Main command handler
async function igsCommand(sock, msg, args, extra, crop = false) {
  const { reply } = extra;
  const prefix = config.prefix || '.';

  try {
    const text = args.join(' ');
    const urlMatch = text.match(/https?:\/\/\S+/);
    
    if (!urlMatch) {
      return reply(
        `*❌ ${toSmallCaps('donne un lien instagram')} !*\n\n` +
        `*${toSmallCaps('usage')} :*\n` +
        `*┃* \`${prefix}igs <url>\` (${toSmallCaps('ajustement auto')})\n` +
        `*┃* \`${prefix}igsc <url>\` (${toSmallCaps('decoupe carree')})\n\n` +
        extra.phrases.footer()
      );
    }

    await sock.sendMessage(extra.from, { react: { text: '⏳', key: msg.key } });

    const downloadData = await igdl(urlMatch[0]).catch(() => null);
    if (!downloadData || !downloadData.data) {
      return reply(`*❌ ${toSmallCaps('echec de la recuperation du media instagram')}.*\n\n${extra.phrases.footer()}`);
    }

    const mediaData = downloadData.data || [];
    const items = mediaData.filter(m => m && pickMediaUrl(m)).slice(0, 10);

    if (items.length === 0) {
      return reply(`*❌ ${toSmallCaps('aucun media trouve sur ce lien')}.*\n\n${extra.phrases.footer()}`);
    }

    const seenHashes = new Set();

    for (let i = 0; i < items.length; i++) {
      try {
        const media = items[i];
        const mediaUrl = pickMediaUrl(media);
        if (!mediaUrl) continue;

        const isVideo = (media?.type === 'video') || /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl);
        const buffer = await fetchBufferFromUrl(mediaUrl);

        const contentHash = crypto.createHash('md5').update(buffer).digest('hex');
        if (seenHashes.has(contentHash)) continue;
        seenHashes.add(contentHash);

        const finalSticker = await convertBufferToStickerWebp(buffer, isVideo, crop);

        await sock.sendMessage(extra.from, { sticker: finalSticker }, { quoted: msg });

        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, 800));
        }
      } catch (perItemErr) {
        // Continuer vers l'élément suivant s'il y a un échec partiel
      }
    }
  } catch (err) {
    console.error('Error in igs command:', err);
    await reply(`*❌ ${toSmallCaps('echec de la creation du sticker depuis instagram')}.*\n\n${extra.phrases.footer()}`);
  }
}

module.exports = {
  name: 'igs',
  aliases: ['igsticker', 'sceau_ig', 'ig_sq'],
  category: '📥 Téléchargements',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴛʀᴀɴsᴍᴜᴛᴇ ᴜɴᴇ ᴘᴜʙʟɪᴄᴀᴛɪᴏɴ/ʀᴇᴇʟ ɪɴsᴛᴀɢʀᴀᴍ ᴇɴ sᴛɪᴄᴋᴇʀ',
  usage: `${config.prefix || '.'}igs [url instagram]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    // Vérifie si la commande appelée est "igsc" (via args ou contexte du message) pour forcer le crop
    const calledCommand = msg.message?.conversation?.split(' ')[0] || 
                          msg.message?.extendedTextMessage?.text?.split(' ')[0] || '';
    
    const shouldCrop = calledCommand.includes('igsc') || args.includes('--crop');
    
    await igsCommand(sock, msg, args, extra, shouldCrop);
  }
};
