/**
 * Ping Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Vérifie la latence du bot, le nom du owner, l'uptime, la mémoire
 * Adapté au style de menu actif
 */
const config = require('../../config');
const { getConnectedOwnerName } = require('../../utils/ownerIdentity');

const SC = (t) => {
  if (!t) return '';
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
};

module.exports = {
  name   : 'ping',
  aliases: ['vitesse', 'p', 'flux', 'latence', 'uping', 'pingpremium'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴠᴇ́ʀɪꜰɪᴇ ʟᴀ ʟᴀᴛᴇɴᴄᴇ, ʟ\'ᴜᴘᴛɪᴍᴇ ᴇᴛ ʟᴇs ɪɴꜰᴏs ᴅᴜ ʙᴏᴛ',
  usage  : `${config.prefix || '.'}ping`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;

    try {
      const start   = Date.now();
      const sent    = await reply(`*☬ ${SC("l'ombre s'éveille")}...*`);
      const latency = Date.now() - start;

      const uptime = process.uptime();
      const h   = Math.floor(uptime / 3600);
      const m   = Math.floor((uptime % 3600) / 60);
      const sec = Math.floor(uptime % 60);
      const memUsage = process.memoryUsage();
      const mem      = Math.round(memUsage.heapUsed / 1024 / 1024);
      const memTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(1);

      const bar = latency < 200 ? '🟢' : latency < 500 ? '🟡' : '🔴';

      // Infos owner depuis config
      const ownerName   = getConnectedOwnerName(sock, Array.isArray(config.ownerName)
        ? config.ownerName[0]
        : (config.ownerName || 'Inconnu'));
      const ownerNumber = Array.isArray(config.ownerNumber)
        ? config.ownerNumber[0]
        : (config.ownerNumber || 'N/A');
      const botName     = config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';
      const prefix      = config.prefix  || '.';

      const text =
        `╭╼━≪• *🌑 ᴘᴜɪssᴀɴᴄᴇ ᴅᴇ ʟ'ᴏᴍʙʀᴇ* •≫━╾╮\n` +
        `*┃* 🤖 *${SC('bot')}* : ${botName}\n` +
        `*┃* 🔣 *${SC('préfixe')}* : [ ${prefix} ]\n` +
        `*┃*\n` +
        `*┃* 👑 *${SC('owner')}* : ${ownerName}\n` +
        `*┃* 📞 *${SC('numéro')}* : +${String(ownerNumber).replace(/\D/g, '')}\n` +
        `*┃*\n` +
        `*┃* 📡 *${SC('statut')}* : 🟢 ᴏɴʟɪɴᴇ\n` +
        `*┃* ⏳ *${SC('latence')}* : ${bar} ${latency}ms\n` +
        `*┃* 💾 *${SC('mémoire')}* : ${mem} MB / ${memTotal} MB\n` +
        `*┃* ⏱️ *${SC('uptime')}* : ${h}h ${m}m ${sec}s\n` +
        `*┃* 🔧 *${SC('node')}* : ${process.version}\n` +
        `*┃* 📦 *${SC('plateforme')}* : ${process.platform}\n` +
        `╰━━━━━━━━━━━━━━━╯\n\n` +
        phrases.footer();

      const key = sent?.key || sent;
      if (key && typeof key === 'object') {
        await sock.sendMessage(from, { text, edit: key });
      } else {
        await reply(text);
      }
    } catch (err) {
      await reply(`*❌ ${SC('erreur flux')} :* ${err.message}`);
    }
  }
};
