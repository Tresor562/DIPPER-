/**
 * ToImage Command — 𝐃𝐚𝐫𝐤 Edition
 * .toimage  → convertit un sticker WebP en image PNG/JPG
 * En réponse à un sticker WhatsApp.
 *
 * Fonctionnement :
 *   1. Télécharge le sticker (WebP) via Baileys
 *   2. Si sharp est installé → convertit en JPEG (qualité 90)
 *   3. Sinon → envoie le WebP directement en tant qu'image
 *      (WhatsApp affiche le WebP comme image normale)
 */
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config.js');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

module.exports = {
  name:'toimage', aliases:['s2img','stickertoimage','webptoimage','convertimage'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴᴠᴇʀᴛɪᴛ ᴜɴ sᴛɪᴄᴋᴇʀ ᴇɴ ɪᴍᴀɢᴇ 🖼️',
  usage:`${config.prefix||'.'}toimage (répondre à un sticker)`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;

    // ── Détection du sticker (message courant ou cité) ────
    const ctx    = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    const stickerInCurrent = msg.message?.stickerMessage;
    const stickerInQuoted  = quoted?.stickerMessage;

    if (!stickerInCurrent && !stickerInQuoted) {
      return reply(
        `*🖼️ ${SC('réponds à un sticker pour le convertir en image')} !*\n\n${phrases.footer()}`
      );
    }

    await sock.sendMessage(from, { react: { text: '🔄', key: msg.key } }).catch(()=>{});

    try {
      // Construction du message cible pour downloadMediaMessage
      const targetMsg = stickerInCurrent ? msg : {
        key: { remoteJid: from, id: ctx.stanzaId, participant: ctx.participant },
        message: quoted,
      };

      const buffer = await downloadMediaMessage(
        targetMsg, 'buffer', {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      if (!buffer || buffer.length < 100) {
        throw new Error('Sticker vide ou invalide');
      }

      // Conversion WebP → JPEG si sharp disponible
      let imageBuffer  = buffer;
      let mimeType     = 'image/webp';

      try {
        const sharp = require('sharp');
        imageBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
        mimeType    = 'image/jpeg';
      } catch (_) {
        // sharp absent → envoyer WebP directement (WhatsApp l'affiche)
      }

      await sock.sendMessage(from, {
        image  : imageBuffer,
        mimetype: mimeType,
        caption:
          `╭╼≪• *🖼️ ${SC('sticker → image')}* •≫╾╮\n` +
          `┃ 📦 *${SC('format')}* : ${mimeType === 'image/jpeg' ? 'JPEG' : 'WebP'}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('erreur de conversion')} :* _${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
