/**
 * SSWebPC + SSWebTab Commands — 𝐃𝐚𝐫𝐤 Edition
 * .sswebpc  <url> → screenshot version bureau
 * .sswebtab <url> → screenshot version tablette
 * Utilise screenshotApi.js (cascade 3 APIs)
 */
const axios  = require('axios');
const config = require('../../config.js');
const { takeScreenshot } = require('../../utils/screenshotApi');

const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

async function runScreenshot(sock, msg, args, extra, device) {
  const { reply, from, phrases } = extra;
  const icons = { mobile: '📱', pc: '🖥️', tablet: '📲' };

  if (!args.length) {
    const cmd = device === 'pc' ? 'sswebpc' : 'sswebtab';
    return reply(`*📌 ᴜsᴀɢᴇ :* \`${config.prefix||'.'}${cmd} <url>\`\n\n${phrases.footer()}`);
  }

  let url = args.join(' ');
  if (!url.startsWith('http')) url = 'https://' + url;

  await sock.sendMessage(from, { react: { text: icons[device], key: msg.key } }).catch(()=>{});

  try {
    const buf = await takeScreenshot(url, device);
    const deviceLabel = device === 'pc' ? SC('bureau') : SC('tablette');
    await sock.sendMessage(from, {
      image  : buf,
      caption:
        `╭╼≪• *${icons[device]} ${SC('capture')} ${deviceLabel}* •≫╾╮\n` +
        `┃ 🌐 *${SC('url')}* : ${url}\n` +
        `┃ 💻 *${SC('mode')}* : ${deviceLabel}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
    }, { quoted: msg });
    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
  } catch (err) {
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
    await reply(`*❌ ${SC('capture impossible')} :* _${err.message}_\n\n${phrases.footer()}`);
  }
}

module.exports = [
  {
    name:'sswebpc', aliases:['sspc','screenshotpc','captureweb_pc'],
    category: '🛠️ Outils généraux',
    description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sᴄʀᴇᴇɴsʜᴏᴛ ᴠᴇʀsɪᴏɴ ʙᴜʀᴇᴀᴜ 🖥️',
    usage:`${config.prefix||'.'}sswebpc <url>`,
    async execute(sock, msg, args, extra) { return runScreenshot(sock, msg, args, extra, 'pc'); }
  },
  {
    name:'sswebtab', aliases:['sstab','screenshottab','captureweb_tab'],
    category: '🛠️ Outils généraux',
    description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sᴄʀᴇᴇɴsʜᴏᴛ ᴠᴇʀsɪᴏɴ ᴛᴀʙʟᴇᴛᴛᴇ 📲',
    usage:`${config.prefix||'.'}sswebtab <url>`,
    async execute(sock, msg, args, extra) { return runScreenshot(sock, msg, args, extra, 'tablet'); }
  }
];
