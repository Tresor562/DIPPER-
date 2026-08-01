/**
 * Sticker Command — 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 *
 * Convertit image ou vidéo en sticker WhatsApp animé ou statique.
 * Utilise ffmpeg-static + node-webpmux pour l'injection EXIF.
 *
 * [FIX v3]
 *  1. fromMe: false ajouté dans la reconstruction du message cité
 *     → Baileys downloadMediaMessage a besoin de ce champ pour décrypter
 *  2. Extraction ctxInfo élargie : fonctionne pour tous les types de messages
 *     (imageMessage direct, videoMessage direct, extendedTextMessage)
 *  3. Meilleur log d'erreur → aide au diagnostic
 *  4. Fallback si targetMessage.key.participant est absent (DM)
 *  5. Guard sur la taille du buffer après téléchargement
 */

'use strict';

const fs        = require('fs');
const path      = require('path');
const { exec }  = require('child_process');
const crypto    = require('crypto');
const webp      = require('node-webpmux');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config    = require('../../config.js');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');

// ── Résolution robuste du chemin ffmpeg ──────────────────────────────────────
// Priorité :
//   1. ffmpeg-static (si disponible ET exécutable)
//   2. ffmpeg système (/usr/bin/ffmpeg, etc.)
// Raison : dans les environnements container (Pterodactyl, Railway, Render…),
// ffmpeg-static n'a pas la permission d'exécution → "Permission denied".
// Utiliser le ffmpeg système évite ce problème sans changer la logique.
function resolveFfmpegPath() {
  // Essai 1 : ffmpeg-static (npm package)
  try {
    const staticPath = require('ffmpeg-static');
    if (staticPath && fs.existsSync(staticPath)) {
      // Vérifie que le binaire est exécutable
      fs.accessSync(staticPath, fs.constants.X_OK);
      return staticPath;
    }
  } catch (_) {
    // Pas installé ou pas exécutable → on passe au fallback
  }

  // Essai 2 : ffmpeg système (PATH)
  const systemPaths = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/bin/ffmpeg',
  ];
  for (const p of systemPaths) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch (_) {}
  }

  // Dernier recours : on laisse le shell trouver ffmpeg dans le PATH
  return 'ffmpeg';
}

const ffmpegPath = resolveFfmpegPath();
console.log('[sticker] ffmpeg résolu →', ffmpegPath);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function toSmallCaps(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// Promisify exec pour ffmpeg
const execPromise = (cmd) =>
  new Promise((resolve, reject) =>
    exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        // Fournit stderr pour faciliter le debug
        reject(new Error(stderr?.slice(-300) || err.message));
      } else {
        resolve(stdout);
      }
    })
  );

module.exports = {
  name   : 'sceau',
  aliases: ['s', 'stiker', 'stc', 'sticker'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴᴠᴇʀᴛɪᴛ ᴜɴᴇ ɪᴍᴀɢᴇ ᴏᴜ ᴜɴᴇ ᴠɪᴅᴇᴏ ᴇɴ sᴛɪᴄᴋᴇʀ',
  usage  : `${config.prefix || '.'}sceau [réponse à une image/vidéo]`,
  groupOnly: false, adminOnly: false, botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, phrases } = extra;
    const chatId   = extra.from;
    const isGroup  = chatId.endsWith('@g.us');

    // ── ÉTAPE 1 : Reconstruction du message cible ─────────────────────────
    //
    // [FIX 1] Extraction ctxInfo élargie :
    //   - Si l'utilisateur RÉPOND à une image avec ".sticker" :
    //     msg.message.extendedTextMessage.contextInfo.quotedMessage existe
    //   - Si l'utilisateur envoie une image AVEC ".sticker" en légende :
    //     msg.message.imageMessage existe directement
    //   - Si l'utilisateur répond à une vidéo :
    //     msg.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage
    //
    const m = msg.message || {};

    // Cherche le contextInfo dans TOUS les types de messages possibles
    const ctxInfo =
      m.extendedTextMessage?.contextInfo ||
      m.imageMessage?.contextInfo        ||
      m.videoMessage?.contextInfo        ||
      m.audioMessage?.contextInfo        ||
      m.documentMessage?.contextInfo     ||
      null;

    let targetMessage = msg;

    if (ctxInfo?.quotedMessage) {
      // [FIX 2] Ajout de fromMe: false — REQUIS par Baileys pour décrypter le média
      // Sans ce champ, downloadMediaMessage peut échouer silencieusement ou lancer
      // "Cannot read properties of undefined (reading 'enc')"
      targetMessage = {
        key: {
          remoteJid  : chatId,
          id         : ctxInfo.stanzaId   || '',
          participant: ctxInfo.participant || (isGroup ? '' : chatId),
          fromMe     : false,              // ← [FIX CRITIQUE] manquait dans l'ancienne version
        },
        message: ctxInfo.quotedMessage,
      };
    }

    // ── ÉTAPE 2 : Détection du média ─────────────────────────────────────
    const mediaMessage =
      targetMessage.message?.imageMessage    ||
      targetMessage.message?.videoMessage    ||
      targetMessage.message?.documentMessage ||
      // Cas direct (image/vidéo avec légende .sticker)
      m.imageMessage ||
      m.videoMessage;

    const prefix = config.prefix || '.';

    if (!mediaMessage) {
      return reply(
        `*⚠️ ${toSmallCaps('repondez a une image ou video avec')} ${prefix}${toSmallCaps('sceau')}*\n` +
        `_${toSmallCaps('ou envoyez le media avec')} ${prefix}${toSmallCaps('sceau en legende')}_\n\n` +
        `> *${toSmallCaps('sᴇᴜʟ ᴅᴀɴs ʟᴏᴍʙʀᴇ, ᴊᴀᴍᴀɪs ᴠᴀɪɴᴄᴜ')} — 𝐃𝐈𝐏𝐏𝐄𝐑*`
      );
    }

    const tempDir  = getTempDir();
    const ts       = Date.now();
    const tempInput  = path.join(tempDir, `stk_in_${ts}`);
    const tempOutput = path.join(tempDir, `stk_out_${ts}.webp`);
    const tempFiles  = [tempInput, tempOutput];

    try {
      // ── ÉTAPE 3 : Téléchargement du média ───────────────────────────────
      console.log('[sticker] Début téléchargement média...');

      let mediaBuffer = null;

      // Si le media est directement dans msg (pas un quoted), on l'utilise tel quel
      // Sinon on utilise le targetMessage reconstruit
      const msgToDownload = (ctxInfo?.quotedMessage) ? targetMessage : msg;

      try {
        mediaBuffer = await downloadMediaMessage(
          msgToDownload,
          'buffer',
          {},
          {
            logger           : { info: () => {}, error: console.error, warn: () => {} },
            reuploadRequest  : sock.updateMediaMessage,
          }
        );
      } catch (dlErr) {
        console.error('[sticker] downloadMediaMessage échoué:', dlErr.message);

        // [FIX 3] Fallback: essayer avec le message original si la reconstruction a échoué
        if (msgToDownload !== msg) {
          console.log('[sticker] Tentative fallback avec msg original...');
          try {
            mediaBuffer = await downloadMediaMessage(
              msg, 'buffer', {},
              { logger: undefined, reuploadRequest: sock.updateMediaMessage }
            );
          } catch (dlErr2) {
            console.error('[sticker] Fallback aussi échoué:', dlErr2.message);
          }
        }
      }

      if (!mediaBuffer || mediaBuffer.length < 100) {
        console.error('[sticker] Buffer vide ou trop petit:', mediaBuffer?.length);
        return reply(
          `*❌ ${toSmallCaps('echec du telechargement du media')}*\n` +
          `_${toSmallCaps('le media est peut etre expire ou inaccessible')}_\n\n` +
          `${phrases?.footer?.() || ''}`
        );
      }

      console.log(`[sticker] Buffer téléchargé: ${mediaBuffer.length} bytes`);

      // Vérification taille max
      if (mediaBuffer.length > MAX_FILE_SIZE) {
        const sizeMB = (mediaBuffer.length / 1024 / 1024).toFixed(2);
        return reply(`*❌ ${toSmallCaps('fichier trop volumineux')} : ${sizeMB}MB (max: 50MB)*`);
      }

      fs.writeFileSync(tempInput, mediaBuffer);

      // ── ÉTAPE 4 : Conversion FFmpeg ──────────────────────────────────────
      const isAnimated =
        mediaMessage.mimetype?.includes('gif')   ||
        mediaMessage.mimetype?.includes('video') ||
        (mediaMessage.seconds || 0) > 0;

      console.log(`[sticker] Conversion ${isAnimated ? 'animé' : 'statique'} → WebP...`);

      const ffmpegCmd = isAnimated
        ? `"${ffmpegPath}" -y -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`
        : `"${ffmpegPath}" -y -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`;

      await execPromise(ffmpegCmd);

      if (!fs.existsSync(tempOutput)) {
        throw new Error('FFmpeg n\'a pas produit de fichier de sortie');
      }

      let webpBuffer = fs.readFileSync(tempOutput);
      console.log(`[sticker] WebP généré: ${webpBuffer.length} bytes`);

      // ── ÉTAPE 5 : Fallback compression si trop lourd (GIF/vidéo animée) ─
      if (isAnimated && webpBuffer.length > 1000 * 1024) {
        console.log('[sticker] WebP trop lourd, recompression...');
        const tempOutput2 = path.join(tempDir, `stk_fb_${Date.now()}.webp`);
        tempFiles.push(tempOutput2);

        const isLargeFile  = mediaBuffer.length > 5 * 1024 * 1024;
        const fallbackCmd  = isLargeFile
          ? `"${ffmpegPath}" -y -i "${tempInput}" -t 2 -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=8,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 30 -compression_level 6 "${tempOutput2}"`
          : `"${ffmpegPath}" -y -i "${tempInput}" -t 3 -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=12,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 45 -compression_level 6 "${tempOutput2}"`;

        try {
          await execPromise(fallbackCmd);
          if (fs.existsSync(tempOutput2)) {
            webpBuffer = fs.readFileSync(tempOutput2);
            console.log(`[sticker] Recompression OK: ${webpBuffer.length} bytes`);
          }
        } catch (fbErr) {
          console.warn('[sticker] Recompression échouée, on garde le WebP original:', fbErr.message);
        }
      }

      // ── ÉTAPE 6 : Injection des métadonnées EXIF (node-webpmux v3) ───────
      try {
        const img = new webp.Image();
        await img.load(webpBuffer);

        const json = {
          'sticker-pack-id'  : crypto.randomBytes(32).toString('hex'),
          'sticker-pack-name': config.packname || '𝐃𝐈𝐏𝐏𝐄𝐑',
          emojis             : ['🤖'],
        };

        // Structure EXIF WhatsApp standard
        const exifAttr = Buffer.from([
          0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
          0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
        ]);

        const jsonBuf  = Buffer.from(JSON.stringify(json), 'utf8');
        const exif     = Buffer.concat([exifAttr, jsonBuf]);
        exif.writeUIntLE(jsonBuf.length, 14, 4);

        img.exif = exif;
        webpBuffer = await img.save(null);

        console.log(`[sticker] EXIF injecté. Taille finale: ${webpBuffer.length} bytes`);
      } catch (exifErr) {
        // L'EXIF est optionnel — le sticker fonctionne sans
        console.warn('[sticker] Injection EXIF échouée (sticker envoyé sans métadonnées):', exifErr.message);
      }

      // ── ÉTAPE 7 : Envoi ────────────────────────────────────────────────────
      await sock.sendMessage(chatId, { sticker: webpBuffer }, { quoted: msg });
      console.log('[sticker] ✅ Sticker envoyé avec succès');

    } catch (error) {
      console.error('[sticker] ❌ Erreur:', error.message);
      await reply(
        `*❌ ${toSmallCaps('echec creation sticker')}*\n` +
        `\`${error.message.slice(0, 150)}\`\n\n` +
        `${phrases?.footer?.() || ''}`
      );
    } finally {
      // Nettoyage systématique
      tempFiles.forEach(f => deleteTempFile(f));
    }
  },
};
