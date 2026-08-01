/**
 * ATTP - Animated Text to Picture Sticker
 * 𝐃𝐚𝐫𝐤  Edition
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../../config.js');
const { writeExifVid } = require('../../utils/exif');

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
  name: 'effet',
  aliases: ['ttp', 'attp'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄʀᴇᴇ ᴜɴ sᴛɪᴄᴋᴇʀ ᴀɴɪᴍᴇ ᴀ ᴘᴀʀᴛɪʀ ᴅ\'ᴜɴ ᴛᴇxᴛᴇ',
  
  // 1. On utilise un getter pour un usage 100% dynamique
  get usage() {
    const activePrefix = config.prefix || '.';
    return `${activePrefix}effet [texte]`;
  },
  
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    
    // 2. On récupère aussi le préfixe frais ici pour les messages d'erreur
    const prefix = config.prefix || '.';

    try {
      if (args.length === 0) {
        return reply(
          `*❌ ${toSmallCaps('veuillez specifier un texte')} !*\n\n` +
          `*${toSmallCaps('exemple')} :* \`${prefix}effet Jésus t'aime\`\n\n` +
          `> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`
        );
      }

      let text = args.join(' ');

      // 🛡️ Traducteur SmallCaps -> Texte normal au cas où l'utilisateur écrit en SmallCaps
      const normalMap = { 'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ғ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ǫ': 'q', 'ʀ': 'r', 's': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'x': 'x', 'ʏ': 'y', 'ᴢ': 'z' };
      text = text.split('').map(char => normalMap[char] || char).join('');

      if (text.length > 50) {
        return reply(`*❌ ${toSmallCaps('le texte est trop long')} ! (ᴍᴀxɪᴍᴜᴍ 𝟻𝟶 ᴄᴀʀᴀᴄᴛᴇʀᴇs).* \n\n> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`);
      }

      // Message d'attente stylisé
      await reply(`*☬ ${toSmallCaps('invocation des couleurs magiques')}...*`);

      try {
        const mp4Buffer = await renderBlinkingVideoWithFfmpeg(text);
        const webpBuffer = await writeExifVid(mp4Buffer, { packname: config.packname || 'ᴛʀᴜᴛʜ ᴅᴇᴠɪᴄᴇs' });

        await sock.sendMessage(extra.from, { sticker: webpBuffer }, { quoted: msg });
      } catch (error) {
        console.error('Error generating attp sticker:', error);
        await reply(`*❌ ${toSmallCaps('echec de la generation du sticker')}.* \n\n> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`);
      }
    } catch (error) {
      console.error('ATTP command error:', error);
      await reply(`*❌ ${toSmallCaps('une erreur est survenue lors de la creation du sticker')}.* \n\n> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`);
    }
  }
};

function renderBlinkingVideoWithFfmpeg(text) {
  return new Promise((resolve, reject) => {
    // Détection de la police selon l'OS
    const fontPath = process.platform === 'win32'
      ? 'C:/Windows/Fonts/arialbd.ttf'
      : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

    const escapeDrawtextText = (s) => s
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/,/g, '\\,')
      .replace(/'/g, "\\'")
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/%/g, '\\%');

    const safeText = escapeDrawtextText(text);
    const safeFontPath = process.platform === 'win32'
      ? fontPath.replace(/\\/g, '/').replace(':', '\\:')
      : fontPath;

    const cycle = 0.3;
    const dur = 1.8; // 6 cycles

    const drawRed = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=red:borderw=2:bordercolor=black@0.6:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2:enable='lt(mod(t\\,${cycle})\\,0.1)'`;
    const drawBlue = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=blue:borderw=2:bordercolor=black@0.6:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(mod(t\\,${cycle})\\,0.1\\,0.2)'`;
    const drawGreen = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=green:borderw=2:bordercolor=black@0.6:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(mod(t\\,${cycle})\\,0.2)'`;

    const filter = `${drawRed},${drawBlue},${drawGreen}`;

    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=black:s=512x512:d=${dur}:r=20`,
      '-vf', filter,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart+frag_keyframe+empty_moov',
      '-t', String(dur),
      '-f', 'mp4',
      'pipe:1'
    ];

    const ff = spawn('ffmpeg', args);
    const chunks = [];
    const errors = [];
    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', e => errors.push(e));
    ff.on('error', reject);
    ff.on('close', code => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
    });
  });
}
