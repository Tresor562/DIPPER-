/**
 * ToVV Command — Convert normal media to View-Once & Delete Original
 * 𝐃𝐚𝐫𝐤 Edition
 *
 * FIXES v2 :
 * [FIX 1] Extraction contextInfo étendue — supporte tous les wrappers
 *         (ephemeralMessage, viewOnceMessageV2, etc.) en DM ET en groupe
 * [FIX 2] ctx.participant peut être undefined en DM — fromMe recalculé
 *         correctement selon le contexte (groupe vs privé)
 * [FIX 3] Suppression du message original sécurisée — ne plante plus
 *         en DM quand participant est absent
 * [FIX 4] Envoi DM propriétaire conditionnel — skip si inutile en privé
 */

'use strict';

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config.js');

function toSmallCaps(text) {
  const normal   = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const smallCaps = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => {
      const i = normal.indexOf(c);
      return i !== -1 ? smallCaps[i] : c;
    }).join('');
}

/**
 * Extraction universelle du contextInfo depuis n'importe quel message.
 * [FIX 1] Supporte : ephemeralMessage, viewOnceMessageV2, extendedTextMessage,
 * imageMessage, videoMessage, documentMessage — en DM ET en groupe.
 */
function extractContextInfo(msg) {
  const m = msg.message || {};

  // Dépaqueter les wrappers connus
  let inner = m;
  if (inner.ephemeralMessage)           inner = inner.ephemeralMessage.message           || inner;
  if (inner.viewOnceMessageV2)          inner = inner.viewOnceMessageV2.message          || inner;
  if (inner.viewOnceMessage)            inner = inner.viewOnceMessage.message            || inner;
  if (inner.documentWithCaptionMessage) inner = inner.documentWithCaptionMessage.message || inner;

  // Chercher le contextInfo dans tous les types de messages supportés
  return (
    inner.extendedTextMessage?.contextInfo ||
    inner.imageMessage?.contextInfo        ||
    inner.videoMessage?.contextInfo        ||
    inner.audioMessage?.contextInfo        ||
    inner.stickerMessage?.contextInfo      ||
    inner.documentMessage?.contextInfo     ||
    null
  );
}

module.exports = {
  name    : 'tovv',
  aliases : ['makevo', 'setviewonce', 'vo'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴᴠᴇʀᴛɪᴛ ᴜɴ ᴍᴇᴅɪᴀ ᴇɴ ᴠᴜᴇ ᴜɴɪǫᴜᴇ ᴇᴛ sᴜᴘᴘʀɪᴍᴇ ʟ\'ᴏʀɪɢɪɴᴀʟ',
  usage       : `${config.prefix || '.'}tovv (en réponse à une image ou vidéo)`,
  groupOnly   : false,
  adminOnly   : false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const chatId  = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    try {
      // ── Extraction du contexte ────────────────────────────────────
      // [FIX 1] extractContextInfo() supporte tous les wrappers,
      // y compris les messages éphémères en DM privé.
      const ctx = extractContextInfo(msg);

      if (!ctx?.quotedMessage) {
        return await reply(
          `*⚠️ ${toSmallCaps('echec de l invocation')}*\n\n` +
          `*┃* 🔮 *${toSmallCaps('repondez a une image ou une video')}*\n` +
          `*┃* *${toSmallCaps('pour lenfermer dans la vue unique')} !*\n\n` +
          extra.phrases.footer()
        );
      }

      // ── Détection du type de média ────────────────────────────────
      const quotedMsg = ctx.quotedMessage;
      let mtype     = null;
      let actualMsg = null;

      if (quotedMsg.imageMessage) {
        mtype     = 'imageMessage';
        actualMsg = quotedMsg.imageMessage;
      } else if (quotedMsg.videoMessage) {
        mtype     = 'videoMessage';
        actualMsg = quotedMsg.videoMessage;
      }

      if (!mtype || !actualMsg) {
        return await reply(
          `*❌ ${toSmallCaps('sceau invalide')}*\n\n` +
          `*┃* 🥀 *${toSmallCaps('le message cite n est pas')}*\n` +
          `*┃* *${toSmallCaps('un media convertible')} (ɪᴍᴀɢᴇ/ᴠɪᴅᴇ́ᴏ).*\n\n` +
          extra.phrases.footer()
        );
      }

      const downloadType = mtype === 'imageMessage' ? 'image' : 'video';

      await reply(`*☬ ${toSmallCaps('extraction et verrouillage du media en cours')}...*`);

      // ── Téléchargement ────────────────────────────────────────────
      const mediaStream = await downloadContentFromMessage(actualMsg, downloadType);
      let buffer = Buffer.from([]);
      for await (const chunk of mediaStream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      if (!buffer || buffer.length < 100) {
        return await reply(
          `*❌ ${toSmallCaps('echec du telechargement du media')}*\n\n${extra.phrases.footer()}`
        );
      }

      const caption = actualMsg.caption || '';

      // ── Suppression du message de commande (.tovv) ────────────────
      try {
        await sock.sendMessage(chatId, { delete: msg.key });
      } catch (_) {}

      // ── Suppression du média original ─────────────────────────────
      // [FIX 2+3] En DM, ctx.participant peut être undefined ou null.
      // - En groupe : participant = l'expéditeur du message original
      // - En DM     : participant = undefined → on utilise remoteJid
      //
      // [FIX] fromMe calculé correctement :
      // - le message est "from me" si l'expéditeur EST le bot
      // - on compare avec le JID du bot, pas avec ctx.participant
      try {
        const botJid  = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        // En DM, l'expéditeur du quoted est soit l'owner (nous), soit l'interlocuteur
        const quotedSender = ctx.participant || (msg.key.fromMe ? botJid : chatId);
        const isFromBot    = quotedSender === botJid ||
                             quotedSender?.split(':')[0]?.split('@')[0] === botJid.split('@')[0];

        const deleteKey = {
          remoteJid: chatId,
          fromMe   : isFromBot,
          id       : ctx.stanzaId,
        };

        // En groupe : ajouter le participant (obligatoire pour Baileys)
        if (isGroup && ctx.participant) {
          deleteKey.participant = ctx.participant;
        }

        await sock.sendMessage(chatId, { delete: deleteKey });
      } catch (_) {
        // La suppression peut échouer si les droits sont insuffisants
        // Ce n'est pas critique — on continue quand même
      }

      // ── Construction du payload ViewOnce ─────────────────────────
      let voPayload = null;
      if (mtype === 'videoMessage') {
        voPayload = {
          video   : buffer,
          caption,
          mimetype: 'video/mp4',
          viewOnce: true,
        };
      } else if (mtype === 'imageMessage') {
        voPayload = {
          image   : buffer,
          caption,
          mimetype: 'image/jpeg',
          viewOnce: true,
        };
      }

      if (!voPayload) return;

      // ── Envoi dans le chat courant ────────────────────────────────
      await sock.sendMessage(chatId, voPayload);

      // ── Envoi en DM au propriétaire (sécurité) ───────────────────
      // [FIX 4] On n'envoie pas en DM si on est DÉJÀ en DM avec le proprio
      // pour éviter de doubler le message inutilement.
      const ownerNums = [
        ...(config.ownerNumber || []),
        ...(config.supremeOwners || []),
      ].map(n => String(n).replace(/\D/g, ''));

      const myNum = (sock.user?.id || '').split(':')[0].split('@')[0];
      const dmTargets = [...new Set([...ownerNums, myNum])];

      const senderJid = msg.key.fromMe
        ? sock.user.id
        : (msg.key.participant || msg.key.remoteJid);
      const senderNum = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');

      for (const ownerNum of dmTargets) {
        // Skip si on est déjà dans un DM avec cette personne
        if (!isGroup && ownerNum === senderNum) continue;
        const ownerJid = ownerNum + '@s.whatsapp.net';
        try {
          await sock.sendMessage(ownerJid, voPayload);
        } catch (_) {}
      }

    } catch (error) {
      console.error('[tovv] Erreur:', error.message);
      try {
        await reply(
          `*❌ ${toSmallCaps('impossible d enfermer ce media')} : ${error.message}*\n\n${extra.phrases.footer()}`
        );
      } catch (_) {}
    }
  },
};
