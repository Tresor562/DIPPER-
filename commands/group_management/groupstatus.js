/**
 * groupstatus.js — Dark Edition v5 SUPREME FIXED
 * ─────────────────────────────────────────────────────────────────────
 * CORRECTIONS APPLIQUÉES :
 *
 * [FIX 1] Détection message cité élargie à tous les wrappers Baileys
 *         (extendedTextMessage, imageMessage, videoMessage, audioMessage,
 *          stickerMessage, documentMessage, viewOnceMessage…)
 *
 * [FIX 2] backgroundColor conservé et injecté correctement dans
 *         extendedTextMessage.backgroundArgb pour les statuts texte
 *
 * [FIX 3] Pas de mutation du paramètre content — travail sur copie
 *
 * [FIX 4] Logs détaillés à chaque étape pour diagnostiquer sans ambiguité
 *
 * [FIX 5] Aliases complets : .groupstatus .gs .groupestatuts .gcstatus
 *
 * [FIX 6] downloadMedia reçoit le bon sous-objet (imageMessage, videoMessage…)
 *         et non le wrapper complet
 *
 * [FIX 7] generateWaveform : .pipe() dirigé vers PassThrough explicite (était
 *         .pipe() sans argument dans l'original txt — crash silencieux)
 */

'use strict';

const crypto = require('crypto');
const {
  generateWAMessageContent,
  generateWAMessageFromContent,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');
const { PassThrough } = require('stream');
const ffmpeg  = require('fluent-ffmpeg');
const config  = require('../../config.js');

const PURPLE_COLOR = '#9C27B0';
const prefix       = config.prefix || '.';

// ──────────────────────────────────────────────────────────────────────
// MODULE EXPORT
// ──────────────────────────────────────────────────────────────────────
module.exports = {
  name   : 'groupstatus',
  // ✅ Aliases demandés : .gs  .groupestatuts  .gcstatus  + anciens conservés
  aliases: ['gs', 'gcstatus', 'groupestatuts', 'togstatus', 'gstatus', 'swgc'],
  description  : '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘᴜʙʟɪᴇ ᴅᴇs sᴛᴀᴛᴜᴛs ᴅɪʀᴇᴄᴛᴇᴍᴇɴᴛ ᴅᴀɴs ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ',
  usage        : `${prefix}groupstatus <texte/media>`,
  category: '🛡️ Protections',
  groupOnly    : true,
  adminOnly    : true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const from = extra.from;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[groupstatus] DÉMARRAGE`);
    console.log(`[groupstatus] from    : ${from}`);
    console.log(`[groupstatus] args    : ${JSON.stringify(args)}`);

    try {
      // ── Vérification groupe ────────────────────────────────────────
      if (!extra.isGroup) {
        return extra.reply('👥 Cette commande ne peut être utilisée que dans les groupes.');
      }

      const caption = (args.join(' ') || '').trim();

      // ── [FIX 1] Détection universelle du message cité ─────────────
      const quotedInfo = extractQuoted(msg);

      console.log(`[groupstatus] caption   : "${caption}"`);
      console.log(`[groupstatus] quoted    : ${quotedInfo ? `type=${quotedInfo.type}` : 'AUCUN'}`);
      if (quotedInfo?.ctx) {
        console.log(`[groupstatus] stanzaId  : ${quotedInfo.ctx.stanzaId}`);
        console.log(`[groupstatus] participant: ${quotedInfo.ctx.participant || 'N/A'}`);
      }
      console.log(`${'═'.repeat(60)}`);

      // ── CAS 1 : Pas de message cité → statut TEXTE ────────────────
      if (!quotedInfo) {
        if (!caption) {
          return extra.reply(
            `╭╼≪• *ᴀʀᴄᴀɴᴇ_sᴛᴀᴛᴜᴛ* •≫╾╮\n` +
            `┃ *ᴇ́ᴛᴀᴛ* : ᴀᴛᴛᴇɴᴛᴇ ⏳\n` +
            `╰━━━━━━━━━━━━━━━╯\n\n` +
            `🔮 *ɪɴᴄᴀɴᴛᴀᴛɪᴏɴ :*\n` +
            `*ᴄᴇᴛ ᴀʀᴄᴀɴᴇ ᴘᴜʙʟɪᴇ ᴅᴇs sᴛᴀᴛᴜᴛs ᴅɪʀᴇᴄᴛᴇᴍᴇɴᴛ ᴅᴀɴs ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ.*\n\n` +
            `  ${prefix}groupstatus <texte>\n` +
            `  ${prefix}groupstatus (en répondant à un média)\n\n` +
            extra.phrases.footer()
          );
        }

        console.log(`[groupstatus] → CAS 1 : statut texte`);
        await extra.reply('⏳ Publication du statut textuel en cours...');

        try {
          await postGroupStatus(sock, from, {
            text           : caption,
            backgroundColor: PURPLE_COLOR,
          });
          return extra.reply(
            `╭╼≪• *ᴀʀᴄᴀɴᴇ_sᴛᴀᴛᴜᴛ* •≫━╮\n` +
            `┃ *ᴇ́ᴛᴀᴛ* : ᴛᴇʀᴍɪɴᴇ́ ✅\n` +
            `╰━━━━━━━━━━━━━━━╯\n\n` +
            `*ʟ'ᴀʀᴄᴀɴᴇ ᴀ ᴘᴜʙʟɪᴇ ʟᴇ sᴛᴀᴛᴜᴛ ᴛᴇxᴛᴜᴇʟ ᴀᴠᴇᴄ sᴜᴄᴄᴇs.*\n\n` +
            extra.phrases.footer()
          );
        } catch (e) {
          console.error('[groupstatus] ❌ text error:', e.message);
          console.error(e.stack);
          return extra.reply(`*❌ ᴇ́ᴄʜᴇᴄ de la publication :* ${e.message || e}`);
        }
      }

      // ── CAS 2 : Message cité → statut MÉDIA ───────────────────────
      const { type, content, ctx } = quotedInfo;
      console.log(`[groupstatus] → CAS 2 : statut média (type=${type})`);

      // IMAGE / STICKER ───────────────────────────────────────────────
      if (type === 'image' || type === 'sticker') {
        console.log(`[groupstatus] → IMAGE/STICKER`);
        await extra.reply("⏳ Publication de l'image en statut...");

        let buf;
        try {
          buf = await downloadQuotedBuf(content, type);
          console.log(`[groupstatus] image buf: ${buf.length} bytes`);
        } catch (e) {
          console.error('[groupstatus] ❌ download image:', e.message);
          return extra.reply(`*❌ ᴇ́ᴄʜᴇᴄ du téléchargement :* ${e.message}`);
        }

        try {
          await postGroupStatus(sock, from, {
            image  : buf,
            caption: caption || content?.caption || '',
          });
          return extra.reply(
            `╭╼≪• *ᴀʀᴄᴀɴᴇ_sᴛᴀᴛᴜᴛ* •≫╾╮\n` +
            `┃ *ᴇ́ᴛᴀᴛ* : ᴛᴇʀᴍɪɴᴇ́ ✅\n` +
            `╰━━━━━━━━━━━━━━━╯\n\n` +
            `*ʟ'ᴀʀᴄᴀɴᴇ ᴀ ᴘᴜʙʟɪᴇ ʟ'ɪᴍᴀɢᴇ ᴀᴠᴇᴄ sᴜᴄᴄᴇs.*\n\n` +
            extra.phrases.footer()
          );
        } catch (e) {
          console.error('[groupstatus] ❌ post image:', e.message);
          console.error(e.stack);
          return extra.reply(`*❌ ᴇ́ᴄʜᴇᴄ de la publication :* ${e.message || e}`);
        }
      }

      // VIDÉO ────────────────────────────────────────────────────────
      if (type === 'video') {
        console.log(`[groupstatus] → VIDÉO`);
        await extra.reply('⏳ Publication de la vidéo en statut...');

        let buf;
        try {
          buf = await downloadQuotedBuf(content, type);
          console.log(`[groupstatus] video buf: ${buf.length} bytes`);
        } catch (e) {
          console.error('[groupstatus] ❌ download video:', e.message);
          return extra.reply(`*❌ ᴇ́ᴄʜᴇᴄ du téléchargement :* ${e.message}`);
        }

        try {
          await postGroupStatus(sock, from, {
            video  : buf,
            caption: caption || content?.caption || '',
          });
          return extra.reply(
            `╭━≪• *ᴀʀᴄᴀɴᴇ_sᴛᴀᴛᴜᴛ* •≫╾╮\n` +
            `┃ *ᴇ́ᴛᴀᴛ* : ᴛᴇʀᴍɪɴᴇ́ ✅\n` +
            `╰━━━━━━━━━━━━━━━╯\n\n` +
            `*ʟ'ᴀʀᴄᴀɴᴇ ᴀ ᴘᴜʙʟɪᴇ ʟᴀ ᴠɪᴅᴇᴏ ᴀᴠᴇᴄ sᴜᴄᴄᴇs.*\n\n` +
            extra.phrases.footer()
          );
        } catch (e) {
          console.error('[groupstatus] ❌ post video:', e.message);
          console.error(e.stack);
          return extra.reply(`*❌ ᴇ́ᴄʜᴇᴄ de la publication :* ${e.message || e}`);
        }
      }

      // AUDIO ────────────────────────────────────────────────────────
      if (type === 'audio') {
        console.log(`[groupstatus] → AUDIO`);
        await extra.reply("⏳ Publication de l'audio en statut...");

        let buf;
        try {
          buf = await downloadQuotedBuf(content, type);
          console.log(`[groupstatus] audio buf: ${buf.length} bytes`);
        } catch (e) {
          console.error('[groupstatus] ❌ download audio:', e.message);
          return extra.reply(`*❌ ᴇ́ᴄʜᴇᴄ du téléchargement :* ${e.message}`);
        }

        let vn;
        try {
          vn = await toVN(buf);
          console.log(`[groupstatus] vn (opus) buf: ${vn.length} bytes`);
        } catch (e) {
          console.warn('[groupstatus] ⚠️ toVN failed, using raw buffer:', e.message);
          vn = buf;
        }

        let waveform;
        try {
          waveform = await generateWaveform(buf);
          console.log(`[groupstatus] waveform: ${waveform ? waveform.length + ' chars' : 'undefined'}`);
        } catch (e) {
          console.warn('[groupstatus] ⚠️ waveform generation failed:', e.message);
          waveform = undefined;
        }

        try {
          await postGroupStatus(sock, from, {
            audio   : vn,
            mimetype: 'audio/ogg; codecs=opus',
            ptt     : true,
            waveform,
          });
          return extra.reply(
            `╭╼≪• *ᴀʀᴄᴀɴᴇ_sᴛᴀᴛᴜᴛ* •≫╾╮\n` +
            `┃ *ᴇ́ᴛᴀᴛ* : ᴛᴇʀᴍɪɴᴇ́ ✅\n` +
            `╰━━━━━━━━━━━━━━━╯\n\n` +
            `*ʟ'ᴀʀᴄᴀɴᴇ ᴀ ᴘᴜʙʟɪᴇ ʟ'ᴀᴜᴅɪᴏ ᴀᴠᴇᴄ sᴜᴄᴄᴇs.*\n\n` +
            extra.phrases.footer()
          );
        } catch (e) {
          console.error('[groupstatus] ❌ post audio:', e.message);
          console.error(e.stack);
          return extra.reply(`*❌ ᴇ́ᴄʜᴇᴄ de la publication :* ${e.message || e}`);
        }
      }

      return extra.reply('*❓ Type de média non supporté. Réponds à une image, une vidéo, un audio ou un sticker.*');

    } catch (e) {
      console.error('[groupstatus] ❌ outer error:', e.message);
      console.error(e.stack);
      return extra.reply(`*❌ ᴇ́ᴄʜᴇᴄ :* ${e.message || e}`);
    }
  },
};

// ══════════════════════════════════════════════════════════════════════
// [FIX 1] extractQuoted — Détecte le message cité dans TOUS les wrappers
// ══════════════════════════════════════════════════════════════════════
function extractQuoted(msg) {
  const m = msg?.message || {};

  // Tous les wrappers susceptibles de contenir un contextInfo avec quotedMessage
  const wrappers = [
    m.extendedTextMessage,
    m.imageMessage,
    m.videoMessage,
    m.audioMessage,
    m.stickerMessage,
    m.documentMessage,
    m.ephemeralMessage?.message?.extendedTextMessage,
    m.viewOnceMessage?.message?.imageMessage,
    m.viewOnceMessage?.message?.videoMessage,
  ].filter(Boolean);

  let ctx = null;
  for (const w of wrappers) {
    if (w?.contextInfo?.quotedMessage && w?.contextInfo?.stanzaId) {
      ctx = w.contextInfo;
      break;
    }
  }

  if (!ctx?.quotedMessage) return null;

  const q = ctx.quotedMessage;

  // Identifier le type du message cité
  if (q.imageMessage)   return { type: 'image',   content: q.imageMessage,   ctx };
  if (q.videoMessage)   return { type: 'video',   content: q.videoMessage,   ctx };
  if (q.audioMessage)   return { type: 'audio',   content: q.audioMessage,   ctx };
  if (q.stickerMessage) return { type: 'sticker', content: q.stickerMessage, ctx };
  if (q.documentMessage)return { type: 'document',content: q.documentMessage,ctx };
  // Texte simple cité → pas de média → pas de quotedInfo (sera traité comme texte libre)
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// [FIX 6] downloadQuotedBuf — Téléchargement propre du média cité
// Reçoit directement le sous-objet (imageMessage, videoMessage…)
// ══════════════════════════════════════════════════════════════════════
async function downloadQuotedBuf(mediaObj, type) {
  // downloadContentFromMessage attend le sous-objet du type demandé
  // ex: imageMessage = { url, mediaKey, fileEncSha256, fileLength, ... }
  const dlType = type === 'sticker' ? 'sticker' : type;

  console.log(`[groupstatus] downloadQuotedBuf type="${dlType}" url=${mediaObj?.url?.slice(0,60) || 'N/A'}`);

  const stream = await downloadContentFromMessage(mediaObj, dlType);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  if (buf.length < 100) {
    throw new Error(`Buffer téléchargé trop petit (${buf.length} bytes) — média expiré ?`);
  }
  return buf;
}

// ══════════════════════════════════════════════════════════════════════
// [FIX 2 + 3] postGroupStatus — Envoi via groupStatusMessageV2
// ══════════════════════════════════════════════════════════════════════
async function postGroupStatus(sock, jid, content) {
  // [FIX 3] Travailler sur une copie pour ne pas muter l'objet appelant
  const workContent     = { ...content };
  const backgroundColor = workContent.backgroundColor;
  delete workContent.backgroundColor;

  console.log(`[groupstatus] postGroupStatus jid=${jid}`);
  console.log(`[groupstatus]   content keys : ${Object.keys(workContent).join(', ')}`);
  console.log(`[groupstatus]   backgroundColor : ${backgroundColor || 'none (media)'}`);

  // [FIX 2] Pour les statuts texte, injecter backgroundColor via extendedTextMessage.backgroundArgb
  // generateWAMessageContent ne gère pas backgroundColor directement pour le texte.
  // On doit construire le bon format Protobuf pour que la couleur soit visible.
  let inside;
  if (workContent.text && backgroundColor) {
    // Convertir la couleur hex en ARGB int32 (format WhatsApp)
    const argb = hexToArgb(backgroundColor);
    console.log(`[groupstatus]   text mode → backgroundArgb=${argb} (${backgroundColor})`);

    // Construire manuellement l'extendedTextMessage avec fond coloré
    inside = {
      extendedTextMessage: {
        text           : workContent.text,
        backgroundArgb : argb,
        font           : 0, // SANS_SERIF
        textArgb       : 0xFFFFFFFF, // texte blanc
        previewType    : 0,
      },
    };
  } else {
    // Média : déléguer à generateWAMessageContent qui gère l'upload
    inside = await generateWAMessageContent(workContent, {
      upload: sock.waUploadToServer,
    });
    console.log(`[groupstatus]   inside keys : ${Object.keys(inside).join(', ')}`);
  }

  // Clé secrète obligatoire pour groupStatusMessageV2
  const secret = crypto.randomBytes(32);

  const waMsg = generateWAMessageFromContent(
    jid,
    {
      groupStatusMessageV2: {
        message: {
          ...inside,
          messageContextInfo: { messageSecret: secret },
        },
      },
    },
    { userJid: sock.user.id }
  );

  console.log(`[groupstatus]   waMsg.key.id       : ${waMsg.key.id}`);
  console.log(`[groupstatus]   waMsg.key.remoteJid: ${waMsg.key.remoteJid}`);

  await sock.relayMessage(jid, waMsg.message, {
    messageId           : waMsg.key.id,
    participant         : { jid },
    additionalAttributes: { type: '4', category: 'status' },
  });

  console.log(`[groupstatus] ✅ relayMessage envoyé`);
  return waMsg;
}

// ══════════════════════════════════════════════════════════════════════
// Convertit '#RRGGBB' en int32 ARGB (alpha=255 par défaut)
// ══════════════════════════════════════════════════════════════════════
function hexToArgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // ARGB : 0xFF000000 | (r << 16) | (g << 8) | b
  // En JS signé 32 bits → utiliser >>> 0 pour unsigned
  return ((0xFF << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

// ══════════════════════════════════════════════════════════════════════
// Conversion audio → OGG/Opus (format PTT)
// ══════════════════════════════════════════════════════════════════════
function toVN(buffer) {
  return new Promise((resolve, reject) => {
    const input  = new PassThrough();
    const output = new PassThrough();
    const chunks = [];

    input.end(buffer);

    ffmpeg(input)
      .noVideo()
      .audioCodec('libopus')
      .format('ogg')
      .audioChannels(1)
      .audioFrequency(48000)
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)))
      .pipe(output);

    output.on('data', (c) => chunks.push(c));
    output.on('error', reject);
  });
}

// ══════════════════════════════════════════════════════════════════════
// [FIX 7] generateWaveform — .pipe() avec destination explicite
// ══════════════════════════════════════════════════════════════════════
function generateWaveform(buffer, bars = 64) {
  return new Promise((resolve, reject) => {
    const input  = new PassThrough();
    const pcmOut = new PassThrough(); // [FIX 7] destination explicite
    const chunks = [];

    input.end(buffer);

    ffmpeg(input)
      .audioChannels(1)
      .audioFrequency(16000)
      .format('s16le')
      .on('error', (e) => { console.warn('[groupstatus] waveform ffmpeg error:', e.message); resolve(undefined); })
      .on('end', () => {
        const raw     = Buffer.concat(chunks);
        const samples = raw.length / 2;
        const amps    = [];

        for (let i = 0; i < samples; i++) {
          amps.push(Math.abs(raw.readInt16LE(i * 2)) / 32768);
        }

        const size = Math.floor(amps.length / bars);
        if (size === 0) return resolve(undefined);

        const avg = Array.from({ length: bars }, (_, i) =>
          amps.slice(i * size, (i + 1) * size).reduce((a, b) => a + b, 0) / size
        );

        const max = Math.max(...avg);
        if (max === 0) return resolve(undefined);

        resolve(
          Buffer.from(avg.map((v) => Math.floor((v / max) * 100))).toString('base64')
        );
      })
      .pipe(pcmOut);

    pcmOut.on('data', (c) => chunks.push(c));
    pcmOut.on('error', (e) => { console.warn('[groupstatus] pcmOut error:', e.message); resolve(undefined); });
  });
}
