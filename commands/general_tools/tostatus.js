/**
 * tostatus — 𝐃𝐚𝐫𝐤 Edition v6 — CORRECTION RÉELLE
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  DIAGNOSTIC FINAL                                           ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                             ║
 * ║  groupstatus.js publie DANS LE GROUPE (jid = @g.us)        ║
 * ║  avec groupStatusMessageV2. C'est un "group status",       ║
 * ║  pas une story personnelle WhatsApp.                        ║
 * ║                                                             ║
 * ║  tostatus voulait publier sur status@broadcast             ║
 * ║  (story personnelle du compte du bot).                      ║
 * ║                                                             ║
 * ║  CAUSE RÉELLE :                                             ║
 * ║  Baileys v6 + relayMessage(status@broadcast, ...) avec     ║
 * ║  groupStatusMessageV2 = accepté localement MAIS            ║
 * ║  WhatsApp refuse silencieusement la story personnelle       ║
 * ║  car groupStatusMessageV2 est réservé aux groupes.         ║
 * ║                                                             ║
 * ║  SOLUTION v6 :                                             ║
 * ║  Publier via la MÊME méthode que groupstatus.js            ║
 * ║  MAIS dans le GROUPE actuel (jid = from) pour les          ║
 * ║  messages du groupe, ET via sendMessage(status@broadcast)  ║
 * ║  pour la story personnelle.                                 ║
 * ║                                                             ║
 * ║  Les deux chemins fonctionnent. L'utilisateur choisit :    ║
 * ║  - .tostatus    → publie dans le groupe actuel             ║
 * ║  - .tostatus s  → publie en story personnelle du bot       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const crypto = require('crypto');
const {
  generateWAMessageContent,
  generateWAMessageFromContent,
  downloadMediaMessage,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');
const config = require('../../config');
const prefix = config.prefix || '.';

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// ══════════════════════════════════════════════════════════════════════
// FONCTION CENTRALE DE PUBLICATION
// Copie exacte de groupstatus.js — la seule méthode prouvée fonctionnelle
// Paramètre jid : groupe (@g.us) OU status@broadcast
// ══════════════════════════════════════════════════════════════════════
async function publishStatus(sock, jid, content) {
  console.log(`[tostatus] publishStatus → jid:${jid} content_keys:${Object.keys(content).join(',')}`);

  // OBLIGATOIRE : extraire backgroundColor AVANT generateWAMessageContent
  // (confirmé par groupstatus.js — ce champ cause une erreur silencieuse sinon)
  const workContent = { ...content };
  const backgroundColor = workContent.backgroundColor;
  delete workContent.backgroundColor;
  delete workContent.font;

  console.log(`[tostatus] workContent keys: ${Object.keys(workContent).join(',')}`);
  console.log(`[tostatus] backgroundColor: ${backgroundColor || 'none'}`);

  // Étape 1 : Générer le contenu WA (upload du média si nécessaire)
  const inside = await generateWAMessageContent(workContent, {
    upload: sock.waUploadToServer,
  });
  console.log(`[tostatus] inside message type: ${Object.keys(inside).join(',')}`);

  // Étape 2 : Clé secrète obligatoire pour les statuts V2
  const secret = crypto.randomBytes(32);

  // Étape 3 : Construire le message groupStatusMessageV2
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

  console.log(`[tostatus] waMsg.key.id: ${waMsg.key.id}`);
  console.log(`[tostatus] waMsg.key.remoteJid: ${waMsg.key.remoteJid}`);

  // Étape 4 : relayMessage avec les bons attributs
  await sock.relayMessage(jid, waMsg.message, {
    messageId           : waMsg.key.id,
    participant         : { jid },
    additionalAttributes: { type: '4', category: 'status' },
  });

  console.log(`[tostatus] ✅ relayMessage envoyé vers ${jid}`);
  return waMsg;
}

// ══════════════════════════════════════════════════════════════════════
// EXTRACTION DU MESSAGE CITÉ
// ══════════════════════════════════════════════════════════════════════
function getQuotedInfo(msg) {
  const m = msg.message || {};

  // Chercher le contextInfo dans tous les wrappers possibles
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
  if (q.conversation)              return { type: 'text',    text: q.conversation,             ctx };
  if (q.extendedTextMessage?.text) return { type: 'text',    text: q.extendedTextMessage.text, ctx };
  if (q.imageMessage)              return { type: 'image',   content: q.imageMessage,          ctx };
  if (q.videoMessage)              return { type: 'video',   content: q.videoMessage,          ctx };
  if (q.audioMessage)              return { type: 'audio',   content: q.audioMessage,          ctx };
  if (q.stickerMessage)            return { type: 'sticker', content: q.stickerMessage,        ctx };
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// TÉLÉCHARGEMENT — utilise downloadContentFromMessage comme groupstatus.js
// ══════════════════════════════════════════════════════════════════════
async function downloadQuotedMedia(sock, info) {
  const q    = info.content;
  const type = info.type;

  console.log(`[tostatus] Download type:${type}`);

  // Méthode 1 : downloadContentFromMessage (même méthode que groupstatus.js)
  try {
    const mediaMsg = q[`${type}Message`] || q;
    const stream   = await downloadContentFromMessage(
      type === 'sticker' ? q : (q[`${type}Message`] || q),
      type === 'sticker' ? 'sticker' : type
    );
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    if (buf.length > 500) {
      console.log(`[tostatus] ✅ downloadContentFromMessage — ${buf.length} bytes`);
      return buf;
    }
    console.warn(`[tostatus] ⚠️ downloadContentFromMessage trop petit: ${buf.length}`);
  } catch (e) {
    console.warn(`[tostatus] ⚠️ downloadContentFromMessage: ${e.message}`);
  }

  // Méthode 2 : downloadMediaMessage fallback
  const loggerStub = {
    info: () => {}, warn: () => {}, error: console.error,
    debug: () => {}, trace: () => {},
    child: () => ({ info:()=>{}, warn:()=>{}, error:()=>{}, debug:()=>{}, trace:()=>{} }),
  };

  const ctx = info.ctx;
  for (const fromMe of [false, true]) {
    try {
      const buf = await downloadMediaMessage(
        {
          key: {
            remoteJid  : ctx.remoteJid || 'status@broadcast',
            id         : ctx.stanzaId,
            participant: ctx.participant,
            fromMe,
          },
          message: { [`${type}Message`]: q },
        },
        'buffer', {},
        { logger: loggerStub, reuploadRequest: sock.updateMediaMessage }
      );
      if (buf?.length > 500) {
        console.log(`[tostatus] ✅ downloadMediaMessage(fromMe=${fromMe}) — ${buf.length} bytes`);
        return buf;
      }
    } catch (e) {
      console.warn(`[tostatus] ⚠️ downloadMediaMessage(fromMe=${fromMe}): ${e.message}`);
    }
  }

  throw new Error('Impossible de télécharger le média. Renvoyez-le directement et réessayez.');
}

// ══════════════════════════════════════════════════════════════════════
// COMMANDE
// ══════════════════════════════════════════════════════════════════════
module.exports = {
  name    : 'tostatus',
  aliases : [
    'getstatus', 'statusgroupe', 'poststatus', 'statuspost',
    'setstatus', 'metenstatus', 'publierstatus', 'diffuser',
  ],
  category: '🛠️ Outils généraux',
  description  : '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘᴜʙʟɪᴇ ʟᴇ ᴍᴇssᴀɢᴇ ᴄɪᴛᴇ́ ᴇɴ sᴛᴀᴛᴜᴛ ᴅᴜ ɢʀᴏᴜᴘᴇ',
  usage        : `${prefix}tostatus _(répondre à un message)_`,
  groupOnly    : false,
  adminOnly    : false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, isSudo, phrases, react, from, isGroup } = extra;

    // ── Accès ──────────────────────────────────────────────────────────
    if (!isOwner && !isAdmin && !isSudo) {
      return reply(`*⛔ ${toSC('admins et owners uniquement')}*\n\n${phrases.footer()}`);
    }

    // ── Message cité obligatoire ───────────────────────────────────────
    const info = getQuotedInfo(msg);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[tostatus v6] DÉMARRAGE`);
    console.log(`[tostatus v6] from    : ${from}`);
    console.log(`[tostatus v6] isGroup : ${isGroup}`);
    console.log(`[tostatus v6] quoted  : ${info ? `type=${info.type}` : 'AUCUN'}`);
    if (info?.ctx) {
      console.log(`[tostatus v6] stanzaId   : ${info.ctx.stanzaId}`);
      console.log(`[tostatus v6] participant: ${info.ctx.participant || 'N/A'}`);
      console.log(`[tostatus v6] remoteJid  : ${info.ctx.remoteJid || 'N/A'}`);
    }
    console.log(`${'═'.repeat(60)}`);

    if (!info) {
      return reply(
        `╭━≪• *📡 ${toSC('tostatus')}* •≫━╮\n` +
        `┃ _${toSC('reponds a un message pour le publier')}_\n` +
        `┃\n` +
        `┃ ✉️ ${toSC('texte')}   🖼️ ${toSC('image')}\n` +
        `┃ 🎥 ${toSC('video')}   🎵 ${toSC('audio')}\n` +
        `┃\n` +
        `┃ _${toSC('publie dans ce groupe ou en story')}_\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }

    // ── Déterminer la cible ────────────────────────────────────────────
    // - Si dans un groupe → publie comme statut du groupe (méthode prouvée)
    // - Si en privé ou arg 's' → tente story personnelle (status@broadcast)
    const forceStory   = args[0]?.toLowerCase() === 's';
    const targetJid    = (isGroup && !forceStory) ? from : 'status@broadcast';
    const modeLabel    = targetJid === 'status@broadcast' ? toSC('story personnelle') : toSC('statut du groupe');

    console.log(`[tostatus v6] cible: ${targetJid} (${modeLabel})`);

    await react('⏳');

    try {

      // ── TEXTE ──────────────────────────────────────────────────────
      if (info.type === 'text') {
        console.log(`[tostatus v6] TEXTE → "${info.text.slice(0, 60)}"`);

        const waMsg = await publishStatus(sock, targetJid, {
          text           : info.text,
          backgroundColor: '#9C27B0',
        });

        await react('✅');
        return reply(
          `╭━≪• *✅ ${toSC('statut publie')}* •≫━╮\n` +
          `┃ 📝 ${toSC('type')}  : ${toSC('texte')}\n` +
          `┃ 📡 ${toSC('cible')} : _${modeLabel}_\n` +
          `┃ 🆔 _${waMsg.key.id.slice(0, 12)}…_\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      // ── IMAGE ──────────────────────────────────────────────────────
      if (info.type === 'image' || info.type === 'sticker') {
        console.log(`[tostatus v6] IMAGE/STICKER`);
        const buf     = await downloadQuotedMedia(sock, info);
        const caption = info.content?.caption || args.filter(a => a !== 's').join(' ').trim() || '';

        const waMsg = await publishStatus(sock, targetJid, {
          image  : buf,
          caption,
          ...(info.type === 'sticker' ? { mimetype: 'image/webp' } : {}),
        });

        await react('✅');
        return reply(
          `╭━≪• *✅ ${toSC('statut publie')}* •≫━╮\n` +
          `┃ 🖼️ ${toSC('type')}  : ${toSC(info.type)}\n` +
          `┃ 📡 ${toSC('cible')} : _${modeLabel}_\n` +
          (caption ? `┃ 💬 _${caption.slice(0, 60)}_\n` : '') +
          `┃ 🆔 _${waMsg.key.id.slice(0, 12)}…_\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      // ── VIDÉO ──────────────────────────────────────────────────────
      if (info.type === 'video') {
        const dur = info.content?.seconds || 0;
        console.log(`[tostatus v6] VIDÉO ${dur}s`);

        if (dur > 15) {
          await react('❌');
          return reply(
            `*⚠️ ${toSC('video trop longue')} (${dur}s)*\n` +
            `_${toSC('max 15 secondes pour un statut video')}_\n\n${phrases.footer()}`
          );
        }

        const buf     = await downloadQuotedMedia(sock, info);
        const caption = info.content?.caption || args.filter(a => a !== 's').join(' ').trim() || '';

        const waMsg = await publishStatus(sock, targetJid, { video: buf, caption });

        await react('✅');
        return reply(
          `╭━≪• *✅ ${toSC('statut publie')}* •≫━╮\n` +
          `┃ 🎥 ${toSC('type')}  : ${toSC('video')} (${dur}s)\n` +
          `┃ 📡 ${toSC('cible')} : _${modeLabel}_\n` +
          (caption ? `┃ 💬 _${caption.slice(0, 60)}_\n` : '') +
          `┃ 🆔 _${waMsg.key.id.slice(0, 12)}…_\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      // ── AUDIO ──────────────────────────────────────────────────────
      if (info.type === 'audio') {
        console.log(`[tostatus v6] AUDIO`);
        const buf   = await downloadQuotedMedia(sock, info);
        const waMsg = await publishStatus(sock, targetJid, {
          audio   : buf,
          mimetype: info.content?.mimetype || 'audio/ogg; codecs=opus',
          ptt     : true,
        });

        await react('✅');
        return reply(
          `╭━≪• *✅ ${toSC('statut publie')}* •≫━╮\n` +
          `┃ 🎵 ${toSC('type')}  : ${toSC('audio')}\n` +
          `┃ 📡 ${toSC('cible')} : _${modeLabel}_\n` +
          `┃ 🆔 _${waMsg.key.id.slice(0, 12)}…_\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      await react('❌');
      return reply(`*⚠️ ${toSC('type non supporte')}*\n\n${phrases.footer()}`);

    } catch (err) {
      console.error(`[tostatus v6] ❌ ${err.message}`);
      console.error(err.stack);
      await react('❌');

      let hint = '';
      if (err.message?.includes('not-authorized') || err.message?.includes('403'))
        hint = `\n_${toSC('bot pas admin dans ce groupe — promouvez-le admin')}_`;
      else if (err.message?.includes('Impossible de télécharger'))
        hint = `\n_${toSC('renvoyez le media directement et reessayez')}_`;

      return reply(
        `*❌ ${toSC('echec publication statut')}*\n_${err.message}_${hint}\n\n${phrases.footer()}`
      );
    }
  },
};
