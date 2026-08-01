const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const webp = require('node-webpmux');
const crypto = require('crypto');

module.exports = {
  name: 'usurper',
  aliases: ['steal', 'take', 't'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴠᴏʟᴇ ᴜɴ sᴛɪᴄᴋᴇʀ ᴇᴛ ᴍᴏᴅɪғɪᴇ ʟᴇ ɴᴏᴍ ᴅᴇ sᴏɴ ᴘᴀᴄᴋ',
  usage: `.usurper [nom du pack]`,
  groupOnly: false,

  async execute(sock, msg, args, extra) {
    const { from, reply, sender } = extra;
    
    // Sécurisation de toSmallCaps au cas où elle ne serait pas dans "extra"
    const safeSmallCaps = typeof extra.toSmallCaps === 'function' ? extra.toSmallCaps : (text) => text;

    let targetMessage = msg;
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;

    // 1. Détection du message cité
    if (ctxInfo?.quotedMessage) {
      targetMessage = {
        key: {
          remoteJid: from,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant
        },
        message: ctxInfo.quotedMessage,
      };
    }

    const stickerMsg = targetMessage.message?.stickerMessage;

    if (!stickerMsg) {
      return reply(`*⚠️ ${safeSmallCaps('repondez a un sticker pour vous en emparer')}*\n\n${extra.phrases.footer()}`);
    }

    try {
      // 2. Téléchargement du sticker
      const mediaBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      if (!mediaBuffer || mediaBuffer.length === 0) {
        return reply(`*❌ ${safeSmallCaps('echec du telechargement du sticker')}.*`);
      }

      // 3. Configuration du pack et sécurité sur "args"
      const userName = msg.pushName || sender.split('@')[0];
      const argsArray = Array.isArray(args) ? args : (args ? args.split(' ') : []);
      const packname = argsArray.length > 0 ? argsArray.join(' ') : safeSmallCaps(userName);

      const img = new webp.Image();
      await img.load(mediaBuffer);

      const json = {
        'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
        'sticker-pack-name': packname || '𝐃𝐈𝐏𝐏𝐄𝐑',
        'sticker-pack-publisher': '𝐃𝐈𝐏𝐏𝐄𝐑',
        emojis: ['🤖'],
      };

      const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
      ]);

      const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
      const exif = Buffer.concat([exifAttr, jsonBuffer]);
      exif.writeUIntLE(jsonBuffer.length, 14, 4);

      img.exif = exif;
      const finalBuffer = await img.save(null);

      // 4. Envoi discret du nouveau sticker
      await sock.sendMessage(from, { sticker: finalBuffer });

      // 5. Suppression de la commande (Seulement si tout a réussi !)
      try {
        await sock.sendMessage(from, { delete: msg.key });
      } catch (_) {}

    } catch (error) {
      console.error('Usurper error:', error);
      // Fallback : Si le message a quand même été supprimé, on envoie sans citer
      try {
        await reply(`*❌ ${safeSmallCaps('echec de l\'usurpation')}.*`);
      } catch (e) {
        await sock.sendMessage(from, { text: `*❌ Échec de l'usurpation.*` });
      }
    }
  },
};
