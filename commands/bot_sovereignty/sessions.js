/**
 * Sessions Command - 𝐃𝐚𝐫𝐤 Edition
 * Gère les sessions multi-utilisateurs actives
 *
 * COMMANDES :
 *   .sessions         → Liste toutes les sessions actives
 *   .sessions stop <num>  → Arrête une session
 */

const config = require('../../config');
const prefix = config.prefix || '.';

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

module.exports = {
  name: 'sessions',
  aliases: ['listsessions', 'allsessions', 'sessionlist'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɢᴇ̀ʀᴇ ʟᴇs sᴇssɪᴏɴs ᴍᴜʟᴛɪ-ᴜᴛɪʟɪsᴀᴛᴇᴜʀs',
  usage: `${prefix}sessions [stop <num>]`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, phrases } = extra;

    if (!isOwner && !extra.isSupremeOwner) {
      return reply(`*⛔ ᴀᴄᴄᴇs ʀᴇꜰᴜsᴇ́*\n` + phrases.footer());
    }

    // Vérifier si le mode multi-session est actif
    if (!process.env.MONGODB_URI) {
      return reply(
        `*⚠️ ${toSC('mode mono-session actif')}*\n\n` +
        `${toSC('ajoutez mongodb uri dans .env pour activer le multi-session')}\n\n` +
        phrases.footer()
      );
    }

    try {
      const { getAllSessions, stopSession } = require('../../utils/sessionManager');

      // ── .sessions stop <num> ──────────────────────────────────────────
      if (args[0]?.toLowerCase() === 'stop' && args[1]) {
        const num = String(args[1]).replace(/\D/g, '');
        const stopped = await stopSession(num);
        return reply(
          stopped
            ? `*✅ ${toSC('session stoppee')} : +${num}*\n\n${phrases.footer()}`
            : `*⚠️ ${toSC('session introuvable')} : +${num}*\n\n${phrases.footer()}`
        );
      }

      // ── Liste ─────────────────────────────────────────────────────────
      const sessions = getAllSessions();

      if (sessions.length === 0) {
        return reply(
          `*╭━≪• 📡 ${toSC('sessions actives')} •≫╾╮*\n` +
          `*┃* 📭 ${toSC('aucune session active')}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      let lines = `*╭━≪• 📡 ${toSC('sessions actives')} (${sessions.length}) •≫╾╮*\n`;
      sessions.forEach((s, i) => {
        const status = s.isOnline ? '🟢' : '🔴';
        lines += `*┃* ${status} *${i + 1}.* +${s.phoneNumber}\n`;
        lines += `*┃*    🗄️ ${s.sessionId}\n`;
      });
      lines += `╰━━━━━━━━━━━━━━━━━╯\n\n`;
      lines += `*💡 ${toSC('pour stopper')}:* \`${prefix}sessions stop <num>\`\n\n`;
      lines += phrases.footer();

      await reply(lines);

    } catch (err) {
      console.error('[sessions] error:', err.message);
      await reply(`*❌ ᴇʀʀᴇᴜʀ :* ${err.message}\n\n${phrases.footer()}`).catch(() => {});
    }
  }
};
