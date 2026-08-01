/**
 * SetMenuImage Command - 𝐃𝐚𝐫𝐤 Edition
 * FIX: apostrophe manquante dans "l'invocation a échoué car la librairie Sharp n'est pas installée"
 */

const fs     = require('fs');
const path   = require('path');
const config = require('../../config');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const prefix = config.prefix || '.';

module.exports = {
  name   : 'illustration_grimoire',
  aliases: ['setmenuimage', 'setmenuimg', 'changemenuimage'],
  category: '👑 Owner',
  ownerOnly: false,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴛʀᴀɴsᴍᴜᴛᴇ ʟ\'ɪʟʟᴜsᴛʀᴀᴛɪᴏɴ ᴘʀɪɴᴄɪᴘᴀʟᴇ ᴅᴜ ᴍᴇɴᴜ',
  usage: `${prefix}setmenuimage (ᴇɴ ʀᴇ́ᴘᴏɴsᴇ ᴀ̀ ᴜɴᴇ ɪᴍᴀɢᴇ/sᴛɪᴄᴋᴇʀ)`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, phrases } = extra;

    try {
      if (!isOwner) {
        return reply(
          `*〆 ᴛᴜ ɴ'ᴀs ᴘᴀs ʟ'ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ sᴜᴘʀᴇ̂ᴍᴇ ᴘᴏᴜʀ ɪɴᴠᴏǫᴜᴇʀ ᴄᴇᴛᴛᴇ ᴘᴜɪssᴀɴᴄᴇ.*\n\n${phrases.footer()}`
        );
      }

      const from = extra.from || msg.key.remoteJid;
      const ctx  = msg.message?.extendedTextMessage?.contextInfo;

      if (!ctx?.quotedMessage) {
        return reply(
          `*📷 ᴍᴜʀᴍᴜʀᴇ ᴄᴇᴛᴛᴇ ᴄᴏᴍᴍᴀɴᴅᴇ ᴇɴ ʀᴇ́ᴘᴏɴsᴇ ᴀ̀ ᴜɴᴇ ɪᴍᴀɢᴇ ᴏᴜ ᴜɴ sᴛɪᴄᴋᴇʀ !*\n\n${phrases.footer()}`
        );
      }

      const quotedMsg = ctx.quotedMessage;
      const imageMsg  = quotedMsg.imageMessage || quotedMsg.stickerMessage;

      if (!imageMsg) {
        return reply(
          `*〆 ʟ'ᴀᴜʀᴀ ᴄɪᴛᴇ́ᴇ ᴅᴏɪᴛ ᴇ̂ᴛʀᴇ ᴜɴᴇ ɪᴍᴀɢᴇ ᴏᴜ ᴜɴ sᴛɪᴄᴋᴇʀ !*\n\n${phrases.footer()}`
        );
      }

      const targetMessage = {
        key: {
          remoteJid  : from,
          id         : ctx.stanzaId,
          participant: ctx.participant,
        },
        message: quotedMsg,
      };

      await reply(`*🔮 ʟ'ᴏʀᴀᴄʟᴇ ᴘʀᴏᴄᴇ̀ᴅᴇ ᴀ̀ ʟ'ᴀsᴘɪʀᴀᴛɪᴏɴ ᴅᴇ ʟ'ᴀᴜʀᴀ... ᴘᴀᴛɪᴇɴᴛᴇ.*`);

      const mediaBuffer = await downloadMediaMessage(
        targetMessage, 'buffer', {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      if (!mediaBuffer) {
        return reply(
          `*〆 ʟ'ᴏʀᴀᴄʟᴇ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ ᴀ̀ ᴛᴇ́ʟᴇ́ᴄʜᴀʀɢᴇʀ ʟ'ɪᴍᴀɢᴇ. ʀᴇ́ᴇssᴀɪᴇ.*\n\n${phrases.footer()}`
        );
      }

      let finalBuffer = mediaBuffer;

      try {
        const sharp = require('sharp');
        const needsConvert = quotedMsg.stickerMessage ||
          (!imageMsg.mimetype?.includes('jpeg') && !imageMsg.mimetype?.includes('jpg'));
        if (needsConvert) {
          finalBuffer = await sharp(mediaBuffer).jpeg({ quality: 90 }).toBuffer();
        }
      } catch (sharpError) {
        // FIX: apostrophe corrigée dans le message d'erreur
        return reply(
          `*〆 ʟ'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ ᴄᴀʀ ʟᴀ ʟɪʙʀᴀɪʀɪᴇ Sharp n'ᴇsᴛ ᴘᴀs ɪɴsᴛᴀʟʟᴇ́ᴇ.*\n` +
          `_ʟᴀɴᴄᴇ : \`npm install sharp\`_\n\n${phrases.footer()}`
        );
      }

      const fallbackPath = path.join(process.cwd(), 'utils', 'bot_image.jpg');
      const utilsDir     = path.dirname(fallbackPath);
      if (!fs.existsSync(utilsDir)) fs.mkdirSync(utilsDir, { recursive: true });
      fs.writeFileSync(fallbackPath, finalBuffer);

      for (let i = 1; i <= 7; i++) {
        try {
          fs.writeFileSync(
            path.join(process.cwd(), 'utils', `bot_image_${i}.jpg`),
            finalBuffer
          );
        } catch (_) {}
      }

      await reply(
        `*✅ ʟ'ɪʟʟᴜsᴛʀᴀᴛɪᴏɴ ᴅᴜ ᴍᴇɴᴜ ᴀ ᴇ́ᴛᴇ́ ᴛʀᴀɴsᴍᴜᴛᴇ́ᴇ sᴜᴄᴄᴇ̀s !*\n\n${phrases.footer()}`
      );

    } catch (error) {
      console.error('SetMenuImage error:', error);
      await reply(
        `*〆 ʟ'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ : ${error.message}*\n\n${phrases.footer()}`
      );
    }
  }
};
