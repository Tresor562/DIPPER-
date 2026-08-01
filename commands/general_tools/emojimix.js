/**
 * EmojiMix Command — 𝐃𝐚𝐫𝐤 Edition
 * ─────────────────────────────────────
 * .emojimix <emoji1> <emoji2>
 * Fusionne deux emojis via Google Emoji Kitchen (gratuit, sans clé).
 *
 * Fonctionnement :
 *   Google Emoji Kitchen génère des PNG fusionnés accessibles via URL publique.
 *   Format : https://www.gstatic.com/android/keyboard/emojikitchen/
 *             {date}/{code1}/{code1}_{code2}.png
 *   On utilise l'API emojiall.com comme proxy pour trouver les bonnes URLs.
 *
 * Fallback : emoji-mashup-discord-bot CDN
 */
const axios  = require('axios');
const config = require('../../config.js');

const SC = t => {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

/**
 * Convertit un emoji en son code Unicode hexadécimal (ex: 🔥 → "1f525")
 * Utilisé pour construire l'URL Google Emoji Kitchen.
 */
function toEmojiCode(emoji) {
  const codePoints = [];
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    if (cp && cp !== 0xFE0F && cp !== 0x200D) {
      codePoints.push(cp.toString(16));
    }
  }
  return codePoints.join('-');
}

/**
 * Génère l'URL Emoji Kitchen directe.
 * Les dates sont fixes (version des emojis générés par Google).
 */
async function getMixUrl(e1, e2) {
  const code1 = toEmojiCode(e1);
  const code2 = toEmojiCode(e2);

  // Dates des versions Emoji Kitchen disponibles
  const dates = ['20230301', '20221101', '20220815', '20220506', '20211115'];

  for (const date of dates) {
    const url1 = `https://www.gstatic.com/android/keyboard/emojikitchen/${date}/u${code1}/u${code1}_u${code2}.png`;
    const url2 = `https://www.gstatic.com/android/keyboard/emojikitchen/${date}/u${code2}/u${code2}_u${code1}.png`;

    for (const url of [url1, url2]) {
      try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
        const ct  = res.headers['content-type'] || '';
        if (ct.includes('image') && res.data.byteLength > 1000) {
          return { buffer: Buffer.from(res.data), url };
        }
      } catch (_) {}
    }
  }

  // Fallback : emoji-kitchen-backend API
  try {
    const res = await axios.get(
      `https://emojikitchen.dev/api/${encodeURIComponent(e1)}/${encodeURIComponent(e2)}`,
      { timeout: 10000 }
    );
    if (res.data?.url) {
      const img = await axios.get(res.data.url, { responseType: 'arraybuffer', timeout: 8000 });
      if (img.data.byteLength > 1000) return { buffer: Buffer.from(img.data), url: res.data.url };
    }
  } catch (_) {}

  throw new Error('Cette combinaison d\'emojis n\'est pas disponible dans Emoji Kitchen.');
}

module.exports = {
  name: 'emojimix', aliases: ['emojifusion', 'mixemoji', 'kitchen', 'ek'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ꜰᴜsɪᴏɴɴᴇ ᴅᴇᴜx ᴇᴍᴏᴊɪs (Google Emoji Kitchen)',
  usage: `${config.prefix||'.'}emojimix 🔥 💧`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;

    if (args.length < 2) {
      return reply(
        `*📌 ᴜsᴀɢᴇ :* \`${config.prefix||'.'}emojimix 🔥 💧\`\n` +
        `_${SC('envoie deux emojis séparés par un espace')}_\n\n${phrases.footer()}`
      );
    }

    const e1 = args[0].trim();
    const e2 = args[1].trim();

    // Vérification basique que ce sont bien des emojis
    const emojiRegex = /\p{Emoji}/u;
    if (!emojiRegex.test(e1) || !emojiRegex.test(e2)) {
      return reply(
        `*⚠️ ${SC('veuillez envoyer deux emojis valides')} !*\n` +
        `_ᴇx : \`${config.prefix||'.'}emojimix 🔥 💧\`_\n\n${phrases.footer()}`
      );
    }

    await sock.sendMessage(from, { react: { text: '🔮', key: msg.key } }).catch(()=>{});

    try {
      const { buffer } = await getMixUrl(e1, e2);

      await sock.sendMessage(from, {
        image  : buffer,
        caption:
          `╭╼≪• *🔮 ${SC('fusion démojis')}* •≫╾╮\n` +
          `┃\n` +
          `┃ ${e1} ✦ ${e2} → 🌟\n` +
          `┃ _${SC('émojis fusionnés par google emoji kitchen')}_\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('combinaison indisponible')}*\n_${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
