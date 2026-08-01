/**
 * GSMArena Command — 𝐃𝐚𝐫𝐤 Edition
 * .gsmarena <nom téléphone>
 * Recherche les specs d'un téléphone via l'API publique gsmarena-api.
 *
 * API : https://gsmarena-api.vercel.app/api?search=...  (JSON gratuit)
 * Fallback : scraping simple de gsmarena.com via axios + regex
 */
const axios  = require('axios');
const config = require('../../config.js');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

async function searchPhone(query) {
  // Tentative 1 : API JSON publique
  try {
    const res = await axios.get(`https://gsmarena-api.vercel.app/api?search=${encodeURIComponent(query)}`, { timeout: 12000 });
    const d   = res.data;
    if (Array.isArray(d) && d.length > 0) return d[0];
    if (d?.name) return d;
  } catch (_) {}

  // Tentative 2 : API alternative (unofficial)
  try {
    const res = await axios.get(`https://api-gsmarena.vercel.app/search?q=${encodeURIComponent(query)}`, { timeout: 12000 });
    const d   = res.data;
    if (d?.data?.length > 0) return d.data[0];
  } catch (_) {}

  throw new Error('Téléphone introuvable sur GSMArena');
}

module.exports = {
  name:'gsmarena', aliases:['telephone_specs','smartphone','specs','phoneinfo','gsmphone'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴄʜᴇʀᴄʜᴇ sᴘᴇ́ᴄɪꜰɪᴄᴀᴛɪᴏɴs ᴅ\'ᴜɴ ᴛᴇ́ʟᴇ́ᴘʜᴏɴᴇ 📱',
  usage:`${config.prefix||'.'}gsmarena <modèle>`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;
    if (!args.length) {
      return reply(`*📌 ᴜsᴀɢᴇ :* \`${config.prefix||'.'}gsmarena iPhone 15\`\n\n${phrases.footer()}`);
    }

    const query = args.join(' ');
    await sock.sendMessage(from, { react: { text: '📱', key: msg.key } }).catch(()=>{});

    try {
      const p = await searchPhone(query);

      // Extraction flexible selon le format de l'API
      const name    = p.name    || p.DeviceName || p.model || query;
      const brand   = p.brand   || p.Brand      || '';
      const network = p.network || p.Network    || '';
      const display = p.display || p.Display    || p.screen || '';
      const camera  = p.camera  || p.Camera     || p.main_camera || '';
      const battery = p.battery || p.Battery    || p.Battery_capacity || '';
      const os      = p.os      || p.OS         || p.platform || '';
      const cpu     = p.cpu     || p.CPU        || p.chipset  || '';
      const ram     = p.ram     || p.RAM        || '';
      const storage = p.storage || p.Storage    || p.internal || '';
      const image   = p.image   || p.thumbnail  || p.img || null;
      const url     = p.url     || p.link       || '';

      const caption =
        `╭╼≪• *📱 ${SC('gsmarena')} : ${name}* •≫╾╮\n` +
        `┃\n` +
        (brand   ? `┃ 🏷️ *${SC('marque')}* : ${brand}\n`    : '') +
        (network ? `┃ 📡 *${SC('réseau')}* : ${network}\n`   : '') +
        (os      ? `┃ 🤖 *${SC('os')}* : ${os}\n`            : '') +
        (cpu     ? `┃ ⚙️ *${SC('cpu')}* : ${cpu}\n`          : '') +
        (ram     ? `┃ 💾 *${SC('ram')}* : ${ram}\n`          : '') +
        (storage ? `┃ 💿 *${SC('stockage')}* : ${storage}\n` : '') +
        (display ? `┃ 🖥️ *${SC('écran')}* : ${display}\n`   : '') +
        (camera  ? `┃ 📸 *${SC('caméra')}* : ${camera}\n`   : '') +
        (battery ? `┃ 🔋 *${SC('batterie')}* : ${battery}\n` : '') +
        (url     ? `┃\n┃ 🔗 ${url}\n`                        : '') +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;

      if (image) {
        await sock.sendMessage(from, { image: { url: image }, caption }, { quoted: msg });
      } else {
        await reply(caption);
      }
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('téléphone introuvable')} : ${query}*\n_${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
