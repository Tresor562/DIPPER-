/**
 * Ping Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Vérifie la latence, l'identité de la session réellement connectée,
 * l'uptime et la mémoire, avec effet newsletter de la chaîne.
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

function normalizePhone(value) {
  const raw = String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return raw.length >= 7 ? raw : '';
}

function getConnectedPhoneNumber(sock) {
  // Sous-session appairée : sessionManager renseigne explicitement ce champ.
  const candidates = [
    sock?._sessionPhoneNumber,
    sock?.user?.id,
    sock?.authState?.creds?.me?.id,
    sock?.authState?.creds?.me?.lid,
  ];
  for (const candidate of candidates) {
    const number = normalizePhone(candidate);
    if (number) return number;
  }

  // Fallback uniquement si WhatsApp n'a encore exposé aucune identité socket.
  const configured = Array.isArray(config.ownerNumber) ? config.ownerNumber[0] : config.ownerNumber;
  return normalizePhone(configured) || 'N/A';
}

function getNewsletterContext() {
  return {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
      newsletterName: config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',
      serverMessageId: -1,
    },
  };
}

module.exports = {
  name   : 'ping',
  aliases: ['vitesse', 'p', 'flux', 'latence', 'uping', 'pingpremium'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴠᴇ́ʀɪꜰɪᴇ ʟᴀ ʟᴀᴛᴇɴᴄᴇ, ʟ\'ᴜᴘᴛɪᴍᴇ ᴇᴛ ʟᴇs ɪɴꜰᴏs ᴅᴜ ʙᴏᴛ',
  usage  : `${config.prefix || '.'}ping`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;

    try {
      const start = Date.now();
      const probe = await reply(`*☬ ${SC("l'ombre s'éveille")}...*`);
      const latency = Date.now() - start;

      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const sec = Math.floor(uptime % 60);
      const memUsage = process.memoryUsage();
      const mem = Math.round(memUsage.heapUsed / 1024 / 1024);
      const memTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(1);
      const bar = latency < 200 ? '🟢' : latency < 500 ? '🟡' : '🔴';

      const ownerName = getConnectedOwnerName(sock, Array.isArray(config.ownerName)
        ? config.ownerName[0]
        : (config.ownerName || 'Inconnu'));
      const ownerNumber = getConnectedPhoneNumber(sock);
      const botName = config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';
      const prefix = config.prefix || '.';

      const text =
        `╭╼━≪• *🌑 ᴘᴜɪssᴀɴᴄᴇ ᴅᴇ ʟ'ᴏᴍʙʀᴇ* •≫━╾╮\n` +
        `*┃* 🤖 *${SC('bot')}* : ${botName}\n` +
        `*┃* 🔣 *${SC('préfixe')}* : [ ${prefix} ]\n` +
        `*┃*\n` +
        `*┃* 👑 *${SC('owner')}* : ${ownerName}\n` +
        `*┃* 📞 *${SC('numéro')}* : ${ownerNumber === 'N/A' ? ownerNumber : `+${ownerNumber}`}\n` +
        `*┃*\n` +
        `*┃* 📡 *${SC('statut')}* : 🟢 ᴏɴʟɪɴᴇ\n` +
        `*┃* ⏳ *${SC('latence')}* : ${bar} ${latency}ms\n` +
        `*┃* 💾 *${SC('mémoire')}* : ${mem} MB / ${memTotal} MB\n` +
        `*┃* ⏱️ *${SC('uptime')}* : ${h}h ${m}m ${sec}s\n` +
        `*┃* 🔧 *${SC('node')}* : ${process.version}\n` +
        `*┃* 📦 *${SC('plateforme')}* : ${process.platform}\n` +
        `╰━━━━━━━━━━━━━━━╯\n\n` +
        phrases.footer();

      const sendOptions = from?.endsWith('@g.us') ? { quoted: msg } : undefined;
      const finalMessage = await sock.sendMessage(from, {
        text,
        contextInfo: getNewsletterContext(),
      }, sendOptions);

      // Le message de mesure n'est qu'une sonde. On le retire si WhatsApp
      // autorise la suppression afin de garder un seul rendu Ping final.
      const probeKey = probe?.key || probe;
      if (probeKey && typeof probeKey === 'object' && probeKey.id) {
        try { await sock.sendMessage(from, { delete: probeKey }); } catch (_) {}
      }

      return finalMessage;
    } catch (err) {
      await reply(`*❌ ${SC('erreur flux')} :* ${err.message}`);
    }
  }
};
