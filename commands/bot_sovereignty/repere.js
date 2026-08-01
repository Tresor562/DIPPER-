/**
 * Repere Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Partage discret du canal via image + bouton newsletter
 * Commande : .repere
 *
 * [FIX v2]
 *  - contextInfo corrigé : encapsulé dans le champ imageMessage (pas au niveau racine)
 *  - Cela évite que handleAntigroupmention intercepte le message du bot lui-même
 *  - Guard !msg.key.fromMe ajouté dans handler.js (côté expéditeur)
 *  - Timeout axios augmenté à 15s
 *  - Gestion d'erreur améliorée avec log
 */

const config = require('../../config');

const NEWSLETTER_JID  = '120363411005383995@newsletter';
const NEWSLETTER_NAME = '𝐃𝐈𝐏𝐏𝐄𝐑';
const IMAGE_URL       = 'https://files.catbox.moe/awh9z3.png';

module.exports = {
  name: 'repere',
  aliases: ['Repere', 'REPERE', 'rep'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘᴀʀᴛᴀɢᴇ ᴅɪsᴄʀᴇᴛ ᴅᴜ ᴄᴀɴᴀʟ',
  usage: `${config.prefix || '.'}repere`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, from } = extra;

    if (!isOwner && !extra.isSupremeOwner) {
      return reply(`*⛔ ᴀᴄᴄᴇs ʀᴇꜰᴜsᴇ́*\n> *𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́*`);
    }

    const caption =
      `⚜️ Tu crois avoir déjà vu des stickers lourds ?\n` +
      `Attends de voir ce qui arrive… 😈\n\n` +
      `🔥 Packs exclusifs\n` +
      `🔥 Stickers rares\n` +
      `🔥 Ambiance Shadow / Anime\n` +
      `🔥 Contenu introuvable ailleurs\n\n` +
      `Chaque nouvel abonné débloque encore plus de contenu 👁️\n\n` +
      `📢 Abonne-toi maintenant et partage la chaîne au maximum pour ne rien rater.\n\n` +
      `🌀 Les prochains drops seront encore plus fous…\n\n` +
      `⚔️ Rejoins l'ombre avant les autres.\n\n` +
      `_Edited by DIPPER_`;

    // [FIX v2] Le contextInfo doit être encapsulé CORRECTEMENT pour Baileys.
    // Mettre contextInfo directement à la racine du payload sendMessage PEUT provoquer
    // une interférence avec handleAntigroupmention si isForwarded=true est détecté
    // sur le message écho (fromMe=true) par le handler.
    //
    // SOLUTION 1 (handler.js) : Guard !msg.key.fromMe ajouté avant handleAntigroupmention ✅
    // SOLUTION 2 (ici) : on garde la structure correcte Baileys pour le newsletter button
    //
    // NOTE : Baileys attend contextInfo DANS le payload message, pas dans les options.
    // La structure correcte pour un bouton newsletter dans sendMessage est :
    //   sock.sendMessage(jid, { image, caption, contextInfo: {...} }, opts)
    // C'est déjà correct — le fix principal est dans handler.js.

    try {
      const axios = require('axios');
      const imgResponse = await axios.get(IMAGE_URL, {
        responseType: 'arraybuffer',
        timeout: 15000,  // [FIX] timeout augmenté à 15s
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const imageBuffer = Buffer.from(imgResponse.data);

      await sock.sendMessage(from, {
        image: imageBuffer,
        caption,
        contextInfo: {
          isForwarded      : true,
          forwardingScore  : 999,
          forwardedNewsletterMessageInfo: {
            newsletterJid  : NEWSLETTER_JID,
            newsletterName : NEWSLETTER_NAME,
            serverMessageId: -1,
          },
        },
      }, { quoted: msg });

      console.log('[repere] ✅ Message canal envoyé dans:', from);

    } catch (err) {
      // [FIX] Log l'erreur pour debug (réseau, catbox down, etc.)
      console.warn('[repere] ⚠️ Image échouée, fallback texte:', err.message);

      // Fallback texte si l'image ne charge pas
      try {
        await sock.sendMessage(from, {
          text: caption,
          contextInfo: {
            isForwarded      : true,
            forwardingScore  : 999,
            forwardedNewsletterMessageInfo: {
              newsletterJid  : NEWSLETTER_JID,
              newsletterName : NEWSLETTER_NAME,
              serverMessageId: -1,
            },
          },
        }, { quoted: msg });
      } catch (err2) {
        console.error('[repere] ❌ Fallback texte aussi échoué:', err2.message);
        await reply(`*❌ Erreur repere :* ${err2.message.slice(0, 80)}`);
      }
    }
  },
};
