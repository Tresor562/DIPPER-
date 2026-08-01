/**
 * tomp3 — 𝐃𝐚𝐫𝐤 Edition
 *
 * Convertit une vidéo (citée en réponse) en fichier audio MP3
 * compatible WhatsApp.
 *
 * UTILISATION :
 *   Répondre à une vidéo puis taper :  .tomp3 / .toaudio / .mp3
 *
 * FONCTIONNEMENT :
 *   1. Détecte la vidéo citée (videoMessage ou documentMessage vidéo)
 *   2. Télécharge le buffer via downloadContentFromMessage (Baileys)
 *   3. Extrait l'audio avec ffmpeg → MP3 128k 44100Hz stéréo
 *   4. Envoie l'audio à l'utilisateur
 *   5. Nettoie les fichiers temporaires
 *
 * DÉPENDANCES :
 *   - @whiskeysockets/baileys  → downloadContentFromMessage
 *   - utils/converter.js       → toAudio (ffmpeg wrapper)
 *   - ffmpeg                   → installé sur le serveur
 */

'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { toAudio }                    = require('../../utils/converter');
const config                         = require('../../config');

const prefix = config.prefix || '.';

// ── Small Caps ─────────────────────────────────────────────────
function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// ── Footer sécurisé ────────────────────────────────────────────
function safeFooter(extra) {
  try { return extra?.phrases?.footer?.() || ''; } catch { return ''; }
}

// ── Télécharger le buffer d'un sous-message Baileys ──────────
async function downloadMediaBuffer(subMessage, type) {
  const stream = await downloadContentFromMessage(subMessage, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  if (!buf || buf.length === 0) throw new Error('Buffer téléchargé vide');
  return buf;
}

// ── Résoudre le message vidéo depuis le message cité ──────────
// Couvre les cas :
//   - videoMessage direct dans le quotedMessage
//   - documentMessage avec mimetype vidéo (fichier mp4 envoyé comme document)
function resolveVideoFromQuoted(quotedMessage) {
  if (!quotedMessage) return null;

  // Cas 1 : videoMessage standard
  if (quotedMessage.videoMessage) {
    return { subMsg: quotedMessage.videoMessage, type: 'video' };
  }

  // Cas 2 : documentMessage dont le mimetype est une vidéo
  const doc = quotedMessage.documentMessage;
  if (doc && /^video\//i.test(doc.mimetype || '')) {
    return { subMsg: doc, type: 'document' };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
module.exports = {
  name          : 'tomp3',
  aliases       : ['toaudio', 'mp3'],
  category: '📥 Téléchargements',
  description   : '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴᴠᴇʀᴛɪᴛ ᴜɴᴇ ᴠɪᴅᴇ́ᴏ ᴇɴ ᴀᴜᴅɪᴏ ᴍᴘ3',
  usage         : `${prefix}tomp3 (ᴇɴ ʀᴇ́ᴘᴏɴᴅᴀɴᴛ ᴀ̀ ᴜɴᴇ ᴠɪᴅᴇ́ᴏ)`,
  groupOnly     : false,
  adminOnly     : false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const chatId = msg.key.remoteJid;
    const reply  = (text) => sock.sendMessage(chatId, { text }, { quoted: msg });

    console.log('[tomp3] ▶ Commande déclenchée');

    try {
      // ── ÉTAPE 1 : Récupérer le message cité ──────────────────
      const ctxInfo     = msg.message?.extendedTextMessage?.contextInfo;
      const quotedMsg   = ctxInfo?.quotedMessage;
      const stanzaId    = ctxInfo?.stanzaId;
      const participant = ctxInfo?.participant;

      const resolved = resolveVideoFromQuoted(quotedMsg);

      if (!resolved) {
        console.log('[tomp3] ⚠ Aucune vidéo citée détectée');
        return reply(
          `❌ *${toSC('replique a une video avec la commande tomp3')}.*\n\n` +
          safeFooter(extra)
        );
      }

      const { subMsg, type } = resolved;
      console.log(`[tomp3] ✅ Vidéo détectée — type Baileys: ${type} | mimetype: ${subMsg.mimetype || 'N/A'}`);

      // ── ÉTAPE 2 : Annonce de traitement ──────────────────────
      await reply(
        `⏳ *${toSC('conversion de la video en audio')}...*\n\n` +
        safeFooter(extra)
      );
      await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

      // ── ÉTAPE 3 : Téléchargement du buffer vidéo ─────────────
      console.log('[tomp3] 📥 Téléchargement de la vidéo...');
      let videoBuffer;
      try {
        videoBuffer = await downloadMediaBuffer(subMsg, type);
        console.log(`[tomp3] ✅ Vidéo téléchargée — ${videoBuffer.length} octets`);
      } catch (dlErr) {
        console.error('[tomp3] ❌ Échec téléchargement:', dlErr.message);
        return reply(
          `❌ *${toSC('echec du telechargement de la video')}.*\n` +
          `_${dlErr.message}_\n\n` +
          safeFooter(extra)
        );
      }

      // ── ÉTAPE 4 : Conversion vidéo → MP3 via ffmpeg ──────────
      // toAudio() de converter.js : -vn -ac 2 -b:a 128k -ar 44100 -f mp3
      // Paramètre ext : 'mp4' pour que ffmpeg écrive le fichier temp avec la bonne extension
      console.log('[tomp3] 🔄 Conversion en MP3 via ffmpeg...');
      let audioBuffer;
      try {
        audioBuffer = await toAudio(videoBuffer, 'mp4');
        if (!audioBuffer || audioBuffer.length === 0) {
          throw new Error('La conversion a retourné un buffer vide');
        }
        console.log(`[tomp3] ✅ Conversion OK — ${audioBuffer.length} octets`);
      } catch (convErr) {
        console.error('[tomp3] ❌ Conversion ffmpeg échouée:', convErr.message);
        return reply(
          `❌ *${toSC('erreur de conversion audio')}.*\n` +
          `_${toSC('verifiez que ffmpeg est installe sur le serveur')}_\n\n` +
          safeFooter(extra)
        );
      }

      // ── ÉTAPE 5 : Envoi de l'audio ───────────────────────────
      console.log('[tomp3] 📤 Envoi de l\'audio WhatsApp...');
      await sock.sendMessage(
        chatId,
        {
          audio   : audioBuffer,
          mimetype: 'audio/mpeg',
          fileName: 'audio.mp3',
          ptt     : false,       // false = lecteur audio standard (pas vocale)
        },
        { quoted: msg }
      );

      // Réaction succès
      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

      console.log('[tomp3] ✅ Audio envoyé avec succès');

      // Confirmation textuelle
      await reply(
        `✅ *${toSC('conversion terminee')}.*\n\n` +
        safeFooter(extra)
      );

    } catch (err) {
      console.error('[tomp3] 💥 Erreur fatale:', err.message);
      try {
        await reply(
          `❌ *${toSC('erreur interne tomp3')}*\n_${err.message}_\n\n` +
          safeFooter(extra)
        );
      } catch (_) {}
    }
  },
};
