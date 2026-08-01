/**
 * Ghost Mode - Mute le bot sur un chat ou pour un utilisateur avec timer
 * 𝐃𝐈𝐏𝐏𝐄𝐑 Edition — Sécurité via extra.isOwner / extra.isSupremeOwner
 */

const database = require('../../database');
const config   = require('../../config.js');

const prefix = config.prefix || '.';

module.exports = {
  name: 'muteDark',
  aliases: ['mutebot', 'veille', 'muteghost'],
  category: '👑 Owner',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘʟᴏɴɢᴇ ʟᴇ ʙᴏᴛ ᴅᴀɴs ʟᴇ sɪʟᴇɴᴄᴇ sᴜʀ ᴄᴇ ᴄʜᴀᴛ ᴏᴜ ᴘᴏᴜʀ ᴜɴᴇ ᴄɪʙʟᴇ ᴀᴠᴇᴄ ᴛᴇᴍᴘᴏ',
  usage: `${prefix}muteghost on/off [minutes]\n${prefix}muteghost @mention [minutes]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,
  ownerOnly: true, // Réservé aux owners — supreme owners passent toujours

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isSupremeOwner: isSuperMe, toSmallCaps, sender } = extra;
    const chatId  = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    try {
      // Sécurité : seuls owners et supreme owners
      if (!isOwner && !isSuperMe) return;

      const senderNumber = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
      const myDM         = `${senderNumber}@s.whatsapp.net`;

      let targetJid;
      const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;

      // --- DÉTECTION DE CIBLE ---
      if (ctxInfo?.quotedMessage) {
        targetJid = ctxInfo.participant;
      } else if (ctxInfo?.mentionedJid?.length > 0) {
        targetJid = ctxInfo.mentionedJid[0];
      } else if (args[0]?.includes('@s.whatsapp.net')) {
        targetJid = args[0];
      } else if (args[0] && /^\d{8,}$/.test(args[0].replace('@', ''))) {
        targetJid = args[0].replace('@', '') + '@s.whatsapp.net';
      }

      // ==========================================
      // SCÉNARIO 1 : CIBLAGE D'UN UTILISATEUR
      // ==========================================
      if (targetJid) {
        const targetNumber = targetJid.split('@')[0].split(':')[0].replace(/\D/g, '');

        if (args.includes('off')) {
          database.updateUser(targetJid, { isMuted: false, muteUntil: 0 });
          return reply(
            `*🔊 ${toSmallCaps('le sortilege est rompu')} !*\n` +
            `> @${targetNumber} *${toSmallCaps('peut a nouveau invoquer 𝐃𝐈𝐏𝐏𝐄𝐑')}.*`,
            { mentions: [targetJid] }
          );
        }

        const timeArg  = args.find(a => !isNaN(a) && a !== '');
        let muteUntil  = 0;
        let timeStr    = toSmallCaps('definitivement');

        if (timeArg) {
          const minutes = parseInt(timeArg);
          muteUntil = Date.now() + (minutes * 60 * 1000);
          timeStr   = toSmallCaps(`pendant ${minutes} minute(s)`);
        }

        database.updateUser(targetJid, { isMuted: true, muteUntil });

        if (isGroup) {
          try { await sock.sendMessage(chatId, { delete: msg.key }); } catch (_) {}
          await sock.sendMessage(myDM, {
            text:
              `*🔇 𝐃𝐈𝐏𝐏𝐄𝐑 › ᴄɪʙʟᴇ ᴍɪsᴇ ᴇɴ sɪʟᴇɴᴄᴇ*\n\n` +
              `┃ 🎯 *ᴄɪʙʟᴇ* : @${targetNumber}\n` +
              `┃ ⏱️ *ᴅᴜʀᴇ́ᴇ* : ${timeStr}\n` +
              `> *♰ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`,
            mentions: [targetJid]
          });
          return;
        }

        return reply(
          `*🔇 ${toSmallCaps('le spectre ignore desormais')}* @${targetNumber} *${timeStr}.*`,
          { mentions: [targetJid] }
        );
      }

      // ==========================================
      // SCÉNARIO 2 : CIBLAGE DU CHAT GLOBAL
      // ==========================================

      // Sans argument → afficher le statut actuel
      if (!args[0]) {
        const settings      = isGroup
          ? database.getGroupSettings(chatId)
          : database.getUserSettings(chatId);
        const isMuted       = settings?.isMuted || false;
        const muteUntil     = settings?.muteUntil || 0;
        const remainingMs   = muteUntil > 0 ? Math.max(0, muteUntil - Date.now()) : 0;
        const remainingMins = Math.ceil(remainingMs / 60000);
        const timerStr      = muteUntil > 0
          ? `(${toSmallCaps(`encore ${remainingMins} min`)})`
          : '';

        return reply(
          `*╭╼━━━≪• ᴇ́ᴛᴀᴛ ᴅᴜ sᴘᴇᴄᴛʀᴇ •≫━━━╾╮*\n` +
          `*┃* *sᴛᴀᴛᴜᴛ* : ${isMuted ? `💤 *ᴍᴜᴛᴇ́ ${timerStr}*` : '🔊 *ᴀᴄᴛɪғ*'}\n` +
          `*┃* *ᴢᴏɴᴇ* : ${isGroup ? toSmallCaps('groupe') : toSmallCaps('prive')}\n` +
          `*╰╼━━━━━━━━━━━━━━━━━━━━━━╾╯*`
        );
      }

      const action = args[0].toLowerCase();

      // --- MUTE ON ---
      if (action === 'on') {
        const timeArg  = args[1];
        let muteUntil  = 0;
        let timeStr    = toSmallCaps('definitivement');

        if (timeArg && !isNaN(timeArg)) {
          const minutes = parseInt(timeArg);
          muteUntil = Date.now() + (minutes * 60 * 1000);
          timeStr   = toSmallCaps(`pendant ${minutes} minute(s)`);
        }

        if (isGroup) {
          database.updateGroupSettings(chatId, { isMuted: true, muteUntil });
          try { await sock.sendMessage(chatId, { delete: msg.key }); } catch (_) {}
          await sock.sendMessage(myDM, {
            text:
              `*🔇 𝐃𝐈𝐏𝐏𝐄𝐑 › ɢʀᴏᴜᴘᴇ ᴍɪs ᴇɴ sɪʟᴇɴᴄᴇ*\n\n` +
              `┃ 🏚️ *ᴢᴏɴᴇ* : ${chatId}\n` +
              `┃ ⏱️ *ᴅᴜʀᴇ́ᴇ* : ${timeStr}\n` +
              `┃ 🔓 *ᴅᴇ́sᴀᴄᴛɪᴠᴇʀ* : ${prefix}muteghost off\n` +
              `> *♰ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`
          });
          return;
        }

        database.updateUser(chatId, { isMuted: true, muteUntil });
        return reply(
          `*🔇 ${toSmallCaps('le spectre est muet sur ce chat')} ${timeStr}.*\n` +
          `> *${toSmallCaps(`pour le reveiller : ${prefix}muteghost off`)}*`
        );
      }

      // --- MUTE OFF ---
      if (action === 'off') {
        if (isGroup) {
          database.updateGroupSettings(chatId, { isMuted: false, muteUntil: 0 });
        } else {
          database.updateUser(chatId, { isMuted: false, muteUntil: 0 });
        }
        return reply(
          `*🔊 ${toSmallCaps('𝐃𝐈𝐏𝐏𝐄𝐑 s\'est eveille et sort du neant')} !*\n` +
          `> *♰ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`
        );
      }

    } catch (error) {
      console.error('Muteghost error:', error);
    }
  }
};
