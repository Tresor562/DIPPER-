/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  𝐃𝐀𝐑𝐊 — Commande .reply (Réponse Automatique Vidéo)            ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  FONCTIONNEMENT :                                                ║
 * ║  1. Le owner répond à N'IMPORTE QUELLE vidéo avec .reply        ║
 * ║  2. Le bot télécharge la vidéo et la sauvegarde LOCALEMENT      ║
 * ║  3. Quand quelqu'un @tag le bot dans un groupe → PTV envoyée   ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  ACCÈS : Supreme Owner, Config Owner, Sudo, Premium              ║
 * ║  ALIAS : .reply  .setvideo  .setreply  .autoanswer  .trigger    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

const database = require('../../database');
const config   = require('../../config.js');
const fs       = require('fs');
const path     = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sessionContext = require('../../utils/sessionContext');

// ────────────────────────────────────────────────────────────────────
// UTILITAIRES
// ────────────────────────────────────────────────────────────────────

function toSmallCaps(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

const prefix = config.prefix || '.';

// ────────────────────────────────────────────────────────────────────
// CHEMINS DE STOCKAGE PERSISTANT
// ────────────────────────────────────────────────────────────────────

// [PHASE 2] Isolation par session : avant, une seule vidéo/audio/image
// autoreply pour TOUT le serveur — le owner d'une session pouvait écraser
// le média envoyé par le bot de toutes les autres sessions. Chaque session
// a maintenant son propre média, stocké dans database/sessions/<sessionId>/
// (même dossier que database.js/purification.js/backupgroup.js).
const LEGACY_DATA_DIR        = path.join(process.cwd(), 'data');
const LEGACY_VIDEO_META_PATH = path.join(LEGACY_DATA_DIR, 'autoreply_video.json');
const LEGACY_VIDEO_FILE_PATH = path.join(LEGACY_DATA_DIR, 'autoreply_video.mp4');
const LEGACY_AUDIO_FILE_PATH = path.join(LEGACY_DATA_DIR, 'autoreply_audio.ogg');
const LEGACY_IMAGE_FILE_PATH = path.join(LEGACY_DATA_DIR, 'autoreply_image.jpg');

function sessionMediaDir() {
  const dir = path.join(process.cwd(), 'database', 'sessions', sessionContext.getCurrentSessionId());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let _legacyReplyMigrationDone = false;
function migrateLegacyReplyOnce() {
  if (_legacyReplyMigrationDone) return;
  _legacyReplyMigrationDone = true;
  if (sessionContext.getCurrentSessionId() !== sessionContext.DEFAULT_SESSION_ID) return;
  const dir = sessionMediaDir();
  const pairs = [
    [LEGACY_VIDEO_META_PATH, path.join(dir, 'autoreply_video.json')],
    [LEGACY_VIDEO_FILE_PATH, path.join(dir, 'autoreply_video.mp4')],
    [LEGACY_AUDIO_FILE_PATH, path.join(dir, 'autoreply_audio.ogg')],
    [LEGACY_IMAGE_FILE_PATH, path.join(dir, 'autoreply_image.jpg')],
  ];
  for (const [legacy, target] of pairs) {
    try { if (fs.existsSync(legacy) && !fs.existsSync(target)) fs.copyFileSync(legacy, target); } catch (_) {}
  }
}

function VIDEO_META_PATH() { migrateLegacyReplyOnce(); return path.join(sessionMediaDir(), 'autoreply_video.json'); }
function VIDEO_FILE_PATH() { migrateLegacyReplyOnce(); return path.join(sessionMediaDir(), 'autoreply_video.mp4'); }
function AUDIO_FILE_PATH() { migrateLegacyReplyOnce(); return path.join(sessionMediaDir(), 'autoreply_audio.ogg'); }
function IMAGE_FILE_PATH() { migrateLegacyReplyOnce(); return path.join(sessionMediaDir(), 'autoreply_image.jpg'); }

function ensureDataDir() {
  sessionMediaDir(); // crée le dossier de la session si besoin
}

function saveMeta(meta) {
  try {
    ensureDataDir();
    fs.writeFileSync(VIDEO_META_PATH(), JSON.stringify(meta, null, 2), 'utf8');
    console.log('[reply] ✅ JSON sauvegardé:', VIDEO_META_PATH());
    return true;
  } catch (e) {
    console.error('[reply] ❌ Erreur sauvegarde JSON:', e.message);
    return false;
  }
}

function loadMeta() {
  try {
    if (fs.existsSync(VIDEO_META_PATH()))
      return JSON.parse(fs.readFileSync(VIDEO_META_PATH(), 'utf8'));
  } catch (e) {
    console.error('[reply] ❌ Erreur lecture JSON:', e.message);
  }
  return null;
}

function getLocalFilePath(mediaType) {
  if (mediaType === 'audioMessage') return AUDIO_FILE_PATH();
  if (mediaType === 'imageMessage') return IMAGE_FILE_PATH();
  return VIDEO_FILE_PATH();
}

// ────────────────────────────────────────────────────────────────────
// EXTRACTION UNIVERSELLE DU CONTEXTINFO
// Gère les wrappers éphémères, viewOnce, et tous les types de messages
// ────────────────────────────────────────────────────────────────────

function extractCtxInfo(msg) {
  // [FIX REPLY] Extraction universelle du contextInfo
  // Dépaqueter récursivement TOUS les wrappers connus
  let m = msg.message || {};
  for (let i = 0; i < 5; i++) { // max 5 niveaux de nesting
    if (m.ephemeralMessage?.message)           { m = m.ephemeralMessage.message;           continue; }
    if (m.viewOnceMessageV2?.message)          { m = m.viewOnceMessageV2.message;          continue; }
    if (m.viewOnceMessage?.message)            { m = m.viewOnceMessage.message;            continue; }
    if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
    break;
  }
  // Chercher le contextInfo dans tous les types possibles
  const ctx = (
    m.extendedTextMessage?.contextInfo    ||
    m.imageMessage?.contextInfo           ||
    m.videoMessage?.contextInfo           ||
    m.audioMessage?.contextInfo           ||
    m.stickerMessage?.contextInfo         ||
    m.documentMessage?.contextInfo        ||
    m.buttonsResponseMessage?.contextInfo ||
    m.listResponseMessage?.contextInfo    ||
    m.reactionMessage?.contextInfo        ||
    // Fallback direct sur msg.message (certains clients)
    msg.message?.extendedTextMessage?.contextInfo ||
    null
  );
  return ctx;
}

// ────────────────────────────────────────────────────────────────────
// VÉRIFICATION D'ACCÈS
// ────────────────────────────────────────────────────────────────────

function hasAccess(sock, msg, extra) {
  const { isOwner, isSupremeOwner, isSudo } = extra;
  if (isSupremeOwner || isOwner || isSudo) return true;
  try {
    const { isPremium } = require('../../utils/premiumManager');
    const jid = msg.key.fromMe
      ? sock.user.id
      : (msg.key.participant || msg.key.remoteJid);
    if (isPremium && isPremium(jid)) return true;
  } catch (_) {}
  return false;
}

// ────────────────────────────────────────────────────────────────────
// TÉLÉCHARGEMENT ROBUSTE DU MÉDIA CITÉ
//
// Stratégie :
//   1. Méthode directe avec downloadMediaMessage (Baileys standard)
//   2. Fallback avec reuploadRequest (refresh URL WhatsApp)
//   3. Fallback avec fromMe=true (si la vidéo vient du bot)
//
// Logs TOUJOURS VISIBLES (pas derrière un flag debug)
// pour diagnostiquer en production sans changer les env vars.
// ────────────────────────────────────────────────────────────────────

async function downloadQuotedMedia(sock, chatId, ctxInfo, quotedContent, msgParticipant) {
  const stanzaId    = ctxInfo.stanzaId    || '';
  // [FIX REPLY] participant: ctxInfo.participant en priorité,
  // puis msg.key.participant (expéditeur du message qui contient le reply),
  // puis chatId en dernier recours
  const participant = ctxInfo.participant || msgParticipant || chatId;
  const mediaType   = Object.keys(quotedContent).find(k => k !== 'messageContextInfo') || '';

  console.log('[reply] 📥 Début téléchargement:', { mediaType, stanzaId, participant, chatId });

  // ── Méthode 1 : downloadMediaMessage standard (fromMe=false) ──────
  try {
    const fakeMsg1 = {
      key    : { remoteJid: chatId, id: stanzaId, participant, fromMe: false },
      message: quotedContent,
    };
    const buf1 = await downloadMediaMessage(fakeMsg1, 'buffer', {}, {
      logger          : { info: () => {}, error: console.error, warn: () => {} },
      reuploadRequest : sock.updateMediaMessage,
    });
    if (buf1 && buf1.length > 1000) {
      console.log(`[reply] ✅ Méthode 1 OK — ${buf1.length} bytes`);
      return buf1;
    }
    console.warn(`[reply] ⚠️ Méthode 1 : buffer trop petit (${buf1?.length ?? 0} bytes)`);
  } catch (e1) {
    console.warn('[reply] ⚠️ Méthode 1 échouée:', e1.message);
  }

  // ── Méthode 2 : fromMe=true (cas où la vidéo vient du bot) ────────
  try {
    const fakeMsg2 = {
      key    : { remoteJid: chatId, id: stanzaId, participant, fromMe: true },
      message: quotedContent,
    };
    const buf2 = await downloadMediaMessage(fakeMsg2, 'buffer', {}, {
      logger          : { info: () => {}, error: console.error, warn: () => {} },
      reuploadRequest : sock.updateMediaMessage,
    });
    if (buf2 && buf2.length > 1000) {
      console.log(`[reply] ✅ Méthode 2 (fromMe=true) OK — ${buf2.length} bytes`);
      return buf2;
    }
    console.warn(`[reply] ⚠️ Méthode 2 : buffer trop petit (${buf2?.length ?? 0} bytes)`);
  } catch (e2) {
    console.warn('[reply] ⚠️ Méthode 2 échouée:', e2.message);
  }

  // ── Méthode 3 : forcer le re-upload WhatsApp ──────────────────────
  try {
    if (typeof sock.updateMediaMessage === 'function') {
      console.log('[reply] 🔄 Méthode 3 : refresh URL WhatsApp...');
      const refreshed = await sock.updateMediaMessage({
        key    : { remoteJid: chatId, id: stanzaId, participant, fromMe: false },
        message: quotedContent,
      });
      const msg3 = {
        key    : { remoteJid: chatId, id: stanzaId, participant, fromMe: false },
        message: refreshed?.message || quotedContent,
      };
      const buf3 = await downloadMediaMessage(msg3, 'buffer', {}, {
        logger: { info: () => {}, error: console.error, warn: () => {} },
      });
      if (buf3 && buf3.length > 1000) {
        console.log(`[reply] ✅ Méthode 3 (refresh) OK — ${buf3.length} bytes`);
        return buf3;
      }
      console.warn(`[reply] ⚠️ Méthode 3 : buffer trop petit (${buf3?.length ?? 0} bytes)`);
    }
  } catch (e3) {
    console.warn('[reply] ⚠️ Méthode 3 échouée:', e3.message);
  }

  console.error('[reply] ❌ TOUTES les méthodes de téléchargement ont échoué');
  console.error('[reply] → Solution : renvoyez la vidéo directement dans ce chat, puis .reply');
  return null;
}

// ════════════════════════════════════════════════════════════════════
// MODULE EXPORT
// ════════════════════════════════════════════════════════════════════

module.exports = {
  name    : 'reponseauto',
  aliases : ['autoanswer', 'reply', 'trigger', 'setreply', 'setvideo'],
  category: '👑 Owner',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛ ᴜɴᴇ ɴᴏᴛᴇ ᴠɪᴅᴇ́ᴏ ᴅᴇ ʀᴇ́ᴘᴏɴsᴇ ᴀᴜᴛᴏᴍᴀᴛɪϙᴜᴇ',
  usage   : `${prefix}reply [délai_secondes] — en répondant à n'importe quelle vidéo`,
  groupOnly: false, adminOnly: false, botAdminNeeded: false,

  // Exposé pour handler.js (compatibilité)
  loadMeta,
  getLocalFilePath,
  VIDEO_FILE_PATH,
  AUDIO_FILE_PATH,
  IMAGE_FILE_PATH,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId  = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    try {
      // ── ACCÈS ──────────────────────────────────────────────────────
      if (!hasAccess(sock, msg, extra)) {
        console.log('[reply] Accès refusé:', msg.key.participant || msg.key.remoteJid);
        return;
      }

      const senderJid    = msg.key.fromMe ? sock.user.id : (msg.key.participant || msg.key.remoteJid);
      const senderNumber = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');
      const subCmd       = (args[0] || '').toLowerCase();

      console.log(`[reply] 🟢 Commande par ${senderNumber} | subCmd="${subCmd}"`);

      // ── SOUS-COMMANDES ─────────────────────────────────────────────
      if (subCmd === 'status') {
        const meta   = loadMeta();
        const fileOk = meta ? fs.existsSync(getLocalFilePath(meta.mediaType)) : false;
        if (!meta) {
          return reply(
            `*📭 ${toSmallCaps('aucune video configuree')}*\n\n` +
            `Répondez à une vidéo avec \`${prefix}reply\`\n\n> *♛ 𝐃𝐈𝐏𝐏𝐄𝐑*`
          );
        }
        return reply(
          `*📹 ${toSmallCaps('reponse auto')} — ${toSmallCaps('statut')} :*\n\n` +
          `${fileOk ? '✅' : '❌'} *Fichier :* ${fileOk ? `OK (${(() => { try { return Math.round(fs.statSync(meta.localPath || getLocalFilePath(meta.mediaType)).size / 1024) + ' Ko'; } catch(_) { return '?'; } })()})` : 'MANQUANT → refaites .reply'}\n` +
          `📂 *Chemin :* ${meta.localPath || getLocalFilePath(meta.mediaType)}\n` +
          `🎬 *Type :* ${meta.mediaType || 'videoMessage'}\n` +
          `🟢 *Active :* ${meta.active ? 'Oui' : 'Non'}\n` +
          `⏱️ *Délai :* ${(meta.delay || 0) / 1000}s\n` +
          `📅 *Définie le :* ${meta.setAt ? new Date(meta.setAt).toLocaleString('fr-FR') : '?'}\n\n` +
          `> *♛ 𝐃𝐈𝐏𝐏𝐄𝐑*`
        );
      }

      if (subCmd === 'off') {
        const meta = loadMeta();
        if (meta) {
          saveMeta({ ...meta, active: false });
        }
        database.updateGroupSettings(chatId, { autoReply: { active: false } });
        return reply(`*⛔ ${toSmallCaps('reponse auto desactivee')}*\n\n> *♛ 𝐃𝐈𝐏𝐏𝐄𝐑*`);
      }

      if (subCmd === 'reset') {
        database.updateGroupSettings(chatId, { autoReply: { active: false } });
        [VIDEO_META_PATH(), VIDEO_FILE_PATH(), AUDIO_FILE_PATH(), IMAGE_FILE_PATH()].forEach(f => {
          try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
        });
        return reply(`*🗑️ ${toSmallCaps('reponse auto supprimee')}*\n\n> *♛ 𝐃𝐈𝐏𝐏𝐄𝐑*`);
      }

      // ── EXTRACTION CONTEXTINFO ─────────────────────────────────────
      const ctxInfo = extractCtxInfo(msg);

      console.log('[reply] 🔍 ctxInfo:', {
        hasCtx     : !!ctxInfo,
        hasQuoted  : !!ctxInfo?.quotedMessage,
        stanzaId   : ctxInfo?.stanzaId,
        participant: ctxInfo?.participant,
        types      : ctxInfo?.quotedMessage ? Object.keys(ctxInfo.quotedMessage) : [],
      });

      if (!ctxInfo?.quotedMessage) {
        return reply(
          `*⚠️ ${toSmallCaps('usage')} :*\n\n` +
          `Répondez à une *vidéo* (de n'importe qui), puis envoyez :\n` +
          `\`${prefix}reply\`       — sans délai\n` +
          `\`${prefix}reply 2\`     — avec 2 secondes de délai\n\n` +
          `*Autres commandes :*\n` +
          `\`${prefix}reply status\` — voir la config actuelle\n` +
          `\`${prefix}reply off\`    — désactiver\n` +
          `\`${prefix}reply reset\`  — tout supprimer\n\n` +
          `> *♛ 𝐃𝐈𝐏𝐏𝐄𝐑*`
        );
      }

      // ── TYPE DU MÉDIA ──────────────────────────────────────────────
      const quotedContent = ctxInfo.quotedMessage;
      // Ignorer messageContextInfo qui n'est pas un type de média
      const mediaType = Object.keys(quotedContent)
        .find(k => ['videoMessage','audioMessage','imageMessage','stickerMessage'].includes(k));

      console.log('[reply] 🎬 Type média:', mediaType, '| Keys:', Object.keys(quotedContent));

      const isVideo = mediaType === 'videoMessage';
      const isAudio = mediaType === 'audioMessage';
      const isImage = mediaType === 'imageMessage';

      if (!isVideo && !isAudio && !isImage) {
        return reply(
          `*❌ ${toSmallCaps('format invalide')} : \`${mediaType || 'inconnu'}\`*\n\n` +
          `Seuls ces types sont acceptés :\n` +
          `📹 Vidéo / 🔵 Note vidéo ← *recommandé*\n` +
          `🎵 Audio / Note vocale\n` +
          `🖼️ Image\n\n` +
          `> *♛ 𝐃𝐈𝐏𝐏𝐄𝐑*`
        );
      }

      // ── PARAMÈTRES ────────────────────────────────────────────────
      const rawDelay = parseInt(subCmd, 10);
      const delayMs  = (!isNaN(rawDelay) && rawDelay >= 0) ? rawDelay * 1000 : 0;
      const isPtv    = isVideo; // toujours true pour une vidéo

      // ── TÉLÉCHARGEMENT ────────────────────────────────────────────
      const waitMsg = await sock.sendMessage(chatId, {
        text: `*⏳ ${toSmallCaps('telechargement en cours')}...*`
      }).catch(() => null);

      // [FIX REPLY] Passer le participant du message original comme fallback
      const _msgParticipant = msg.key.participant || null;
      const buf = await downloadQuotedMedia(sock, chatId, ctxInfo, quotedContent, _msgParticipant);

      if (waitMsg) {
        try { await sock.sendMessage(chatId, { delete: waitMsg.key }); } catch (_) {}
      }

      if (!buf || buf.length < 1000) {
        return reply(
          `*❌ ${toSmallCaps('echec du telechargement')}*\n\n` +
          `La vidéo n'a pas pu être téléchargée (${buf?.length ?? 0} bytes).\n\n` +
          `*💡 Solution :*\n` +
          `Renvoyez la vidéo directement dans ce chat (sans la rediriger),\n` +
          `puis répondez à ce nouveau message avec \`${prefix}reply\`\n\n` +
          `> *♛ 𝐃𝐈𝐏𝐏𝐄𝐑*`
        );
      }

      // ── SAUVEGARDE ────────────────────────────────────────────────
      ensureDataDir();
      const localPath = getLocalFilePath(mediaType);
      fs.writeFileSync(localPath, buf);
      console.log(`[reply] 💾 Fichier sauvegardé: ${localPath} (${buf.length} bytes)`);

      // ── MÉTADONNÉES ───────────────────────────────────────────────
      const mimetype = isVideo
        ? 'video/mp4'
        : isAudio
          ? (quotedContent.audioMessage?.mimetype || 'audio/ogg; codecs=opus')
          : (quotedContent.imageMessage?.mimetype || 'image/jpeg');

      const meta = {
        active   : true,
        delay    : delayMs,
        isPtv,
        mediaType,
        mimetype,
        localPath,
        setBy    : senderNumber,
        setAt    : Date.now(),
      };

      saveMeta(meta);

      // [FIX PERF] Invalider le cache arCfg du handler immédiatement
      // Sans ça, le handler garde l'ancienne config 30s après .reply
      try {
        const handlerPath = require.resolve('../../handler');
        const handlerMod  = require.cache[handlerPath];
        if (handlerMod?.exports?.invalidateArCfgCache) {
          handlerMod.exports.invalidateArCfgCache();
        }
      } catch (_) {}

      // Mettre à jour la BDD (non bloquant si ça échoue)
      try {
        database.updateGroupSettings(chatId, {
          autoReply: { active: true, delay: delayMs, isPtv, mediaType, localPath, mimetype }
        });
      } catch (_) {}

      // ── CONFIRMATION — toujours visible dans le chat courant ────
      // [FIX REPLY BUG] L'ancienne version supprimait le message en groupe
      // ET envoyait la confirmation uniquement en DM → l'user ne voyait RIEN
      // si le DM échouait (bot pas encore dans ses contacts, etc.)
      //
      // Nouvelle logique :
      //   1. Confirmation dans le chat courant (toujours visible)
      //   2. Bonus DM si en groupe (discrétion optionnelle)
      //   (On ne supprime plus le message .reply de l'utilisateur)
      const typeLabel  = isVideo ? '🔵 Note Vidéo (PTV)' : isAudio ? '🎵 Audio' : '🖼️ Image';
      const confirmMsg =
        `*✅ [𝐃𝐈𝐏𝐏𝐄𝐑] ʀᴇ́ᴘᴏɴsᴇ ᴀᴜᴛᴏ ᴀʀᴍᴇ́ᴇ !*\n\n` +
        `*📹 Type :* ${typeLabel}\n` +
        `*💾 Fichier :* ✅ Sauvegardé (${Math.round(buf.length / 1024)} Ko)\n` +
        `*⏱️ Délai :* ${delayMs / 1000}s\n\n` +
        `_Quand quelqu'un @mentionne le bot dans un groupe,_\n` +
        `_il recevra automatiquement cette réponse_ \n\n` +
        `> *♛ 𝐃𝐈𝐏𝐏𝐄𝐑*`;

      // Toujours répondre dans le chat courant (groupe ou privé)
      await reply(confirmMsg);

      // Bonus : aussi en DM si en groupe (non bloquant)
      if (isGroup) {
        sock.sendMessage(senderNumber + '@s.whatsapp.net', { text: confirmMsg }).catch(() => {});
      }

    } catch (error) {
      console.error('[reply] ❌ Erreur fatale:', error.message, error.stack);
      try {
        await reply(`*❌ Erreur :*\n\`\`\`\n${error.message}\n\`\`\`\n\n> *♛ 𝐃𝐈𝐏𝐏𝐄𝐑*`);
      } catch (_) {}
    }
  },
};
