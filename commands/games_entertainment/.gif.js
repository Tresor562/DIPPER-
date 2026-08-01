/**
 * Gif
 * 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');
const config = require('../../config.js');

// ── Résolution robuste du chemin ffmpeg ──────────────────────────────────────
function resolveFfmpegPath() {
  try {
    const staticPath = require('ffmpeg-static');
    if (staticPath && fs.existsSync(staticPath)) {
      fs.accessSync(staticPath, fs.constants.X_OK);
      return staticPath;
    }
  } catch (_) {}
  const systemPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/bin/ffmpeg'];
  for (const p of systemPaths) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (_) {}
  }
  return 'ffmpeg';
}
const ffmpegPath = resolveFfmpegPath();

const BASE = 'https://api.shizo.top/tools/meme-search';

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

const prefix = config.prefix || '.';

module.exports = {
  name: 'quete_fresque',
  aliases: ['memes', 'sm', 'smeme', 'memesearch', 'gifsearch', 'gif'],
  category: '🎮 Jeux & Fun',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇxᴛᴘʟᴏʀᴇ ᴇᴛ ʀᴇᴄᴜᴘᴇʀᴇ ᴅᴇs ᴍᴇᴍᴇs ᴅᴀɴs ʟᴇs ᴀʀᴄʜɪᴠᴇs',
  usage: `${prefix}quete_fresque <invocation>`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const from = extra.from;

    try {
      const query = args.join(' ').trim();
      const defaultCredit = `> *𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́*`;

      if (!query) {
        return reply(
          `*🔮 ${toSmallCaps('usage')} :* \`${prefix}quete_fresque <${toSmallCaps('recherche')}>\`\n\n` +
          `*ᴇxᴇᴍᴘʟᴇ :* \`${prefix}quete_fresque hello\`\n\n` +
          `> *𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́*`
        );
      }

      // Fetch meme from API
      const url = `${BASE}?apikey=shizo&query=${encodeURIComponent(query)}`;
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      const mediaBuffer = Buffer.from(response.data);

      // Verify buffer is valid
      if (!mediaBuffer || mediaBuffer.length === 0) {
        throw new Error('Empty response from API');
      }

      // Check file size limits
      const maxVideoSize = 16 * 1024 * 1024; // 16MB
      const maxImageSize = 5 * 1024 * 1024; // 5MB

      // Check content type to determine if it's GIF, image, or video
      const contentType = response.headers['content-type'] || '';

      // Check file signature (magic bytes) for better detection
      const fileHeader = mediaBuffer.slice(0, 6).toString('ascii');
      const isGIF = fileHeader === 'GIF89a' || fileHeader === 'GIF87a' || contentType.includes('gif');

      // Determine media type and send accordingly
      if (isGIF) {
        // Check size for GIF
        if (mediaBuffer.length > maxVideoSize) {
          throw new Error(`GIF file too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max 16MB)`);
        }

        // Convert GIF to MP4 for better WhatsApp compatibility
        const tempDir = getTempDir();
        const timestamp = Date.now();
        const gifPath = path.join(tempDir, `meme_gif_${timestamp}.gif`);
        const mp4Path = path.join(tempDir, `meme_mp4_${timestamp}.mp4`);

        let mp4Buffer = null;

        try {
          // Write GIF to temp file
          fs.writeFileSync(gifPath, mediaBuffer);

          // Convert GIF to MP4 using FFmpeg
          const ffmpegCmd = `"${ffmpegPath}" -i "${gifPath}" -vf "fps=15,scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -fps_mode vfr -y "${mp4Path}"`;

          await new Promise((resolve, reject) => {
            exec(ffmpegCmd, { maxBuffer: 10 * 1024 * 1024 }, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });

          // Read MP4 file
          if (!fs.existsSync(mp4Path)) {
            throw new Error('MP4 output file not found');
          }

          mp4Buffer = fs.readFileSync(mp4Path);

          // Check MP4 size
          if (mp4Buffer.length > maxVideoSize) {
            throw new Error(`MP4 file too large: ${(mp4Buffer.length / 1024 / 1024).toFixed(2)}MB`);
          }

          // Send MP4 as video with gifPlayback and caption
          await sock.sendMessage(from, {
            video: mp4Buffer,
            mimetype: 'video/mp4',
            gifPlayback: true,
            caption: defaultCredit // 💥 Ajout de la caption ici
          }, { quoted: msg });

        } catch (convertError) {
          // Fallback: try sending original GIF as document with caption
          try {
            await sock.sendMessage(from, {
              document: mediaBuffer,
              mimetype: 'image/gif',
              fileName: `meme_${query.replace(/\s+/g, '_')}.gif`,
              caption: defaultCredit // 💥 Ajout de la caption ici
            }, { quoted: msg });
          } catch (docError) {
            throw new Error(`Failed to send meme: ${convertError.message}`);
          }
        } finally {
          // Cleanup temp files
          deleteTempFile(gifPath);
          deleteTempFile(mp4Path);
        }
      } else if (contentType.includes('video') || contentType.includes('mp4')) {
        // Check size for video
        if (mediaBuffer.length > maxVideoSize) {
          throw new Error(`Video file too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max 16MB)`);
        }

        await sock.sendMessage(from, {
          video: mediaBuffer,
          mimetype: 'video/mp4',
          caption: defaultCredit // 💥 Ajout de la caption ici
        }, { quoted: msg });
      } else {
        // Check size for image
        if (mediaBuffer.length > maxImageSize) {
          throw new Error(`Image file too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`);
        }

        await sock.sendMessage(from, {
          image: mediaBuffer,
          caption: defaultCredit // 💥 Ajout de la caption ici
        }, { quoted: msg });
      }

    } catch (error) {
      console.error('Meme search error:', error);
      await reply(`*❌ ${toSmallCaps('l invocation a echoue')} : ${error.message}*\n\n> *𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́*`);
    }
  }
};
