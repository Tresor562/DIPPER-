/**
 * TinyURL Command — 𝐃𝐚𝐫𝐤 Edition
 * .tinyurl <url> → raccourcit un lien via TinyURL API (gratuit, JSON)
 * Fallback : is.gd, then v.gd
 */
const axios  = require('axios');
const config = require('../../config.js');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

async function shorten(url) {
  // Tentative 1 : TinyURL JSON API (gratuit, sans clé)
  try {
    const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 10000 });
    if (typeof res.data === 'string' && res.data.startsWith('http')) return res.data.trim();
  } catch (_) {}

  // Tentative 2 : is.gd
  try {
    const res = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, { timeout: 10000 });
    if (typeof res.data === 'string' && res.data.startsWith('http')) return res.data.trim();
  } catch (_) {}

  // Tentative 3 : v.gd
  const res = await axios.get(`https://v.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, { timeout: 10000 });
  if (typeof res.data === 'string' && res.data.startsWith('http')) return res.data.trim();

  throw new Error('Impossible de raccourcir ce lien');
}

module.exports = {
  name:'tinyurl', aliases:['shorten','short','raccourcir','shortlink','miniurl'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴀᴄᴄᴏᴜʀᴄɪᴛ ᴜɴ ʟɪᴇɴ URL 🔗',
  usage:`${config.prefix||'.'}tinyurl <url>`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;
    if (!args.length) {
      return reply(`*📌 ᴜsᴀɢᴇ :* \`${config.prefix||'.'}tinyurl <url>\`\n\n${phrases.footer()}`);
    }

    let url = args[0];
    if (!url.startsWith('http')) url = 'https://' + url;

    await sock.sendMessage(from, { react: { text: '🔗', key: msg.key } }).catch(()=>{});

    try {
      const short = await shorten(url);
      await reply(
        `╭╼≪• *🔗 ${SC('lien raccourci')}* •≫╾╮\n` +
        `┃\n` +
        `┃ 🌐 *${SC('original')}* : ${url.slice(0,60)}${url.length>60?'…':''}\n` +
        `┃ ✂️ *${SC('court')}* : ${short}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('erreur')} :* _${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
