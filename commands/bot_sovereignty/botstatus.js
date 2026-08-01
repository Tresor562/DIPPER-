/**
 * BotStatus Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Dashboard complet : RAM, CPU, uptime, config, commandes...
 */

const os      = require('os');
const config  = require('../../config');
const database = require('../../database');
const { loadCommands } = require('../../utils/commandLoader');
const { getConnectedOwnerName } = require('../../utils/ownerIdentity');

const prefix = config.prefix || '.';

// Uptime du processus Node au démarrage
const BOT_START_TIME = Date.now();

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days)    parts.push(`${days}j`);
  if (hours)   parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatBytes(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576)    return (bytes / 1048576).toFixed(2) + ' MB';
  if (bytes >= 1024)       return (bytes / 1024).toFixed(2) + ' KB';
  return bytes + ' B';
}

function getProgressBar(used, total, length = 10) {
  const pct      = Math.min(used / total, 1);
  const filled   = Math.round(pct * length);
  const empty    = length - filled;
  const bar      = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${(pct * 100).toFixed(1)}%`;
}

function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  const idle  = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  return ((1 - idle / total) * 100).toFixed(1);
}

module.exports = {
  name: 'botstatus',
  aliases: ['sysinfo', 'bt','gi','systeme'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴀsʜʙᴏᴀʀᴅ ᴄᴏᴍᴘʟᴇᴛ ᴅᴜ sʏsᴛᴇ̀ᴍᴇ',
  usage: `${prefix}botstatus`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isSupremeOwner: isSuperMe, toSmallCaps } = extra;

    if (!isOwner && !isSuperMe) return;

    try {
      // ── Commandes ──────────────────────────────────────
      const cmds       = loadCommands();
      const totalCmds  = cmds.size;
      const categories = new Set();
      cmds.forEach(cmd => categories.add(cmd.category || '?'));

      // ── RAM ─────────────────────────────────────────────
      const totalRam  = os.totalmem();
      const freeRam   = os.freemem();
      const usedRam   = totalRam - freeRam;
      const heapUsed  = process.memoryUsage().heapUsed;
      const heapTotal = process.memoryUsage().heapTotal;
      const rss       = process.memoryUsage().rss;

      // ── CPU ─────────────────────────────────────────────
      const cpuModel  = os.cpus()[0]?.model?.trim() || 'Inconnu';
      const cpuCores  = os.cpus().length;
      const cpuUsage  = getCpuUsage();
      const loadAvg   = os.loadavg()[0].toFixed(2);

      // ── Système ─────────────────────────────────────────
      const platform  = os.platform();
      const arch      = os.arch();
      const hostname  = os.hostname();
      const nodeVer   = process.version;
      const sysUptime = formatUptime(os.uptime() * 1000);
      const botUptime = formatUptime(Date.now() - BOT_START_TIME);

      // ── Config ──────────────────────────────────────────
      const botName    = config.botName    || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑';
      const selfMode   = config.selfMode   ? '🔒 ᴘʀɪᴠᴇ́' : '🌐 ᴘᴜʙʟɪᴄ';
      const ghostgMode = database.getGhostgMode()?.toLowerCase() === 'on' ? '🟢 ᴀᴄᴛɪᴠᴇ́' : '🔴 ɪɴᴀᴄᴛɪғ';
      const autoReact  = config.autoReact  ? '🟢 ᴏɴ' : '🔴 ᴏғғ';
      const autoRead   = config.autoRead   ? '🟢 ᴏɴ' : '🔴 ᴏғғ';
      const autoTyping = config.autoTyping ? '🟢 ᴏɴ' : '🔴 ᴏғғ';
      const autoBio    = config.autoBio    ? '🟢 ᴏɴ' : '🔴 ᴏғғ';
      const ownerName  = getConnectedOwnerName(sock, Array.isArray(config.ownerName)
        ? config.ownerName.join(', ')
        : (config.ownerName || '—'));

      // ── Bannis ──────────────────────────────────────────
      const bannedRaw  = process.env.BANNED_USERS || '';
      const bannedList = bannedRaw.split(',').map(n => n.trim()).filter(Boolean);

      // ── Build du message ────────────────────────────────
      const msg_text =
        `╭━≪• *🤖 𝐃𝐈𝐏𝐏𝐄𝐑  sᴛᴀᴛᴜs* •≫━╮\n` +
        `┃\n` +

        // Identité
        `┃ 🔮 *${toSmallCaps('identite')}*\n` +
        `┃ ┌ 🤖 *ɴᴏᴍ* : ${botName}\n` +
        `┃ ├ 🗡️ *ᴏᴡɴᴇʀ* : ${toSmallCaps(ownerName)}\n` +
        `┃ ├ ⚡ *ᴘʀᴇ́ғɪxᴇ* : [ *${prefix}* ]\n` +
        `┃ └ 🆔 *ɪᴅ ʙᴏᴛ* : ${sock.user?.id?.split(':')[0] || '—'}\n` +
        `┃\n` +

        // Config
        `┃ ⚙️ *${toSmallCaps('configuration')}*\n` +
        `┃ ┌ 🔒 *ᴍᴏᴅᴇ* : ${selfMode}\n` +
        `┃ ├ 🧠 *ɴʟᴘ* : ${ghostgMode}\n` +
        `┃ ├ ⚡ *ᴀᴜᴛᴏ-ʀᴇᴀᴄᴛ* : ${autoReact}\n` +
        `┃ ├ 👁️ *ᴀᴜᴛᴏ-ʀᴇᴀᴅ* : ${autoRead}\n` +
        `┃ ├ ✍️ *ᴀᴜᴛᴏ-ᴛʏᴘɪɴɢ* : ${autoTyping}\n` +
        `┃ └ 📝 *ᴀᴜᴛᴏ-ʙɪᴏ* : ${autoBio}\n` +
        `┃\n` +

        // Commandes
        `┃ 📚 *${toSmallCaps('commandes')}*\n` +
        `┃ ┌ 🗂️ *ᴄᴀᴛᴇ́ɢᴏʀɪᴇs* : ${categories.size}\n` +
        `┃ └ ⚔️ *ᴛᴏᴛᴀʟ* : ${totalCmds} ʀɪᴛᴜᴇʟs\n` +
        `┃\n` +

        // Uptime
        `┃ ⏱️ *${toSmallCaps('uptime')}*\n` +
        `┃ ┌ 🤖 *ʙᴏᴛ* : ${botUptime}\n` +
        `┃ └ 🖥️ *sᴇʀᴠᴇᴜʀ* : ${sysUptime}\n` +
        `┃\n` +

        // RAM
        `┃ 🧠 *${toSmallCaps('memoire ram')}*\n` +
        `┃ ┌ 📊 *sʏsᴛᴇ̀ᴍᴇ* : ${formatBytes(usedRam)} / ${formatBytes(totalRam)}\n` +
        `┃ │ ${getProgressBar(usedRam, totalRam)}\n` +
        `┃ ├ 🔷 *ʜᴇᴀᴘ ɴᴏᴅᴇ* : ${formatBytes(heapUsed)} / ${formatBytes(heapTotal)}\n` +
        `┃ └ 📦 *ʀss ᴘʀᴏᴄᴇss* : ${formatBytes(rss)}\n` +
        `┃\n` +

        // CPU
        `┃ ⚡ *${toSmallCaps('processeur')}*\n` +
        `┃ ┌ 🔲 *ᴍᴏᴅᴇ̀ʟᴇ* : ${cpuModel.slice(0, 30)}\n` +
        `┃ ├ 🔢 *ᴄᴏᴇᴜʀs* : ${cpuCores}\n` +
        `┃ ├ 📈 *ᴜsᴀɢᴇ* : ${cpuUsage}%\n` +
        `┃ │ ${getProgressBar(parseFloat(cpuUsage), 100)}\n` +
        `┃ └ 📉 *ʟᴏᴀᴅ ᴀᴠɢ* : ${loadAvg}\n` +
        `┃\n` +

        // Serveur
        `┃ 🖥️ *${toSmallCaps('serveur')}*\n` +
        `┃ ┌ 🐧 *ᴘʟᴀᴛᴇ-ғᴏʀᴍᴇ* : ${platform} (${arch})\n` +
        `┃ ├ 🌐 *ʜᴏsᴛ* : ${hostname}\n` +
        `┃ └ 🟢 *ɴᴏᴅᴇ.ᴊs* : ${nodeVer}\n` +
        `┃\n` +

        // Sécurité
        `┃ 🛡️ *${toSmallCaps('securite')}*\n` +
        `┃ ┌ 👑 *sᴜᴘʀᴇᴍᴇ ᴏᴡɴᴇʀs* : ${(config.supremeOwners || []).length}\n` +
        `┃ ├ 🔑 *ᴏᴡɴᴇʀs* : ${(config.ownerNumber || []).length}\n` +
        `┃ └ 🚫 *ʙᴀɴɴɪs* : ${bannedList.length} ᴇɴᴛɪᴛᴇ́s\n` +
        `┃\n` +

        `╰━━━━━━━━━━━━━━━━━━━━╯\n` +
        `> *♰ ᴇ́ᴛᴀʙʟɪ ᴘᴀʀ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`;

      await reply(msg_text);

    } catch (error) {
      console.error('[botstatus] error:', error);
      await reply(`*〆 ${toSmallCaps('erreur lors de la lecture du systeme')} : ${error.message}*`);
    }
  }
};
