/**
 * Media Tag Command - 𝐃𝐚𝐫𝐤 Edition
 * Envoie un média (image/vidéo/audio) en taguant tous les membres du groupe
 *
 * [FIX] Fichier complètement absent — référencé dans menus et configs
 *       mais n'existait pas dans commands/group_management/
 *
 * USAGE :
 *   .mediatag          → Affiche l'aide
 *   .mediatag (+ media en reply) → Envoie le média en mentionnant tous les membres
 *   .mediatag <texte>  → Envoie un texte en mentionnant tous les membres
 */

const config = require('../../config.js');
const prefix = config.prefix || '.';

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function downloadMedia(msg, type) {
  try {
    const mediaMsg = msg[`${type}Message`] || msg;
    const stream   = await downloadContentFromMessage(mediaMsg, type);
    const chunks   = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (e) {
    console.error('[mediatag] downloadMedia error:', e.message);
    return null;
  }
}

module.exports = {
  name: 'mediatag',
  // [FIX] 'sendtag' repris ici : ancien doublon 'mediatag' supprimé de
  // mentstats.js (même nom + alias 'tagmedia' en collision), fusionné
  // dans cette implémentation pour ne perdre aucune commande existante.
  aliases: ['tagmedia', 'mediamention', 'broadcastmedia', 'sendtag'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇɴᴠᴏɪᴇ ᴜɴ ᴍᴇ́ᴅɪᴀ ᴇɴ ᴛᴀɢᴜᴀɴᴛ ᴛᴏᴜs ʟᴇs ᴍᴇᴍʙʀᴇs',
  usage: `${prefix}mediatag [texte] (en répondant à un média)`,
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, isAdmin, isOwner, from, phrases } = extra;
    const chatId = msg.key.remoteJid;

    try {
      if (!isOwner && !isAdmin) {
        return reply(
          `*❌ ${toSC('incantation reservee aux administrateurs du sanctuaire')} !*\n\n${phrases.footer()}`
        );
      }

      // Récupérer la liste des membres
      let groupMetadata;
      try {
        groupMetadata = await sock.groupMetadata(chatId);
      } catch (e) {
        return reply(`*❌ ${toSC('impossible de recuperer les membres du groupe')} !*\n\n${phrases.footer()}`);
      }

      const participants = groupMetadata?.participants || [];
      if (participants.length === 0) {
        return reply(`*⚠️ ${toSC('aucun membre trouve dans ce groupe')}.*\n\n${phrases.footer()}`);
      }

      const mentions = participants.map(p => p.id);
      const caption  = args.join(' ').trim();

      // Vérifier si c'est une réponse à un média
      const ctxInfo    = msg.message?.extendedTextMessage?.contextInfo;
      const hasQuoted  = !!ctxInfo?.quotedMessage;
      const quotedMsg  = ctxInfo?.quotedMessage;
      const mtype      = hasQuoted ? Object.keys(quotedMsg)[0] : null;

      // ── CAS 1 : Réponse à une image ─────────────────────────────────────
      if (hasQuoted && /image/i.test(mtype)) {
        await reply(`⏳ ${toSC('envoi de l image en cours')}...`);
        const buf = await downloadMedia(quotedMsg, 'image');
        if (!buf) return reply(`*❌ ${toSC('echec du telechargement de l image')}.*`);

        await sock.sendMessage(chatId, {
          image   : buf,
          caption : caption ||
            `📢 *╭━≪• ${toSC('annonce')} •≫━╾╮*\n` +
            `${mentions.map(m => `@${m.split('@')[0]}`).join(' ')}\n` +
            `╰━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
          mentions,
        }, { quoted: msg });
        return;
      }

      // ── CAS 2 : Réponse à une vidéo ─────────────────────────────────────
      if (hasQuoted && /video/i.test(mtype)) {
        await reply(`⏳ ${toSC('envoi de la video en cours')}...`);
        const buf = await downloadMedia(quotedMsg, 'video');
        if (!buf) return reply(`*❌ ${toSC('echec du telechargement de la video')}.*`);

        await sock.sendMessage(chatId, {
          video   : buf,
          caption : caption ||
            `📢 *╭━≪• ${toSC('annonce')} •≫━╾╮*\n` +
            `${mentions.map(m => `@${m.split('@')[0]}`).join(' ')}\n` +
            `╰━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
          mimetype: 'video/mp4',
          mentions,
        }, { quoted: msg });
        return;
      }

      // ── CAS 3 : Réponse à un audio ──────────────────────────────────────
      if (hasQuoted && /audio/i.test(mtype)) {
        await reply(`⏳ ${toSC('envoi de l audio en cours')}...`);
        const buf = await downloadMedia(quotedMsg, 'audio');
        if (!buf) return reply(`*❌ ${toSC('echec du telechargement de l audio')}.*`);

        // D'abord le texte de tag
        const tagText =
          `📢 *╭━≪• ${toSC('annonce audio')} •≫━╾╮*\n` +
          `${mentions.map(m => `@${m.split('@')[0]}`).join(' ')}\n` +
          `╰━━━━━━━━━━━━━━━╯` +
          (caption ? `\n\n📝 ${caption}` : '') +
          `\n\n${phrases.footer()}`;

        await sock.sendMessage(chatId, { text: tagText, mentions }, { quoted: msg });
        await sock.sendMessage(chatId, {
          audio   : buf,
          mimetype: 'audio/mpeg',
          ptt     : false,
        });
        return;
      }

      // ── CAS 4 : Texte seul ──────────────────────────────────────────────
      if (!caption) {
        return reply(
          `*╭━≪• 📢 ${toSC('mediatag')} •≫╾╮*\n` +
          `*┃* ${toSC('envoie un message en taguant tous les membres.')}\n` +
          `*┃*\n` +
          `*┃* 🔮 *${toSC('usage')}* :\n` +
          `*┃*   \`${prefix}mediatag <texte>\`\n` +
          `*┃*   ${toSC('ou reponds a un media avec')} \`${prefix}mediatag\`\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      const tagText =
        `📢 *╭━≪• ${toSC('annonce')} •≫━╾╮*\n\n` +
        `📝 ${caption}\n\n` +
        `${mentions.map(m => `@${m.split('@')[0]}`).join(' ')}\n\n` +
        `╰━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;

      await sock.sendMessage(chatId, { text: tagText, mentions }, { quoted: msg });

    } catch (err) {
      console.error('[mediatag] error:', err.message);
      await reply(`*❌ ᴇʀʀᴇᴜʀ :* ${err.message}\n\n${phrases.footer()}`).catch(() => {});
    }
  }
};
