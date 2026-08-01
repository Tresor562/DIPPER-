/**
 * Device Command — 𝐃𝐚𝐫𝐤 Edition
 * ─────────────────────────────────
 * .device [@user / réponse]
 * Affiche les informations de l'appareil d'un utilisateur WhatsApp.
 * Source : décodage du JID device suffix (Baileys) + user-agent si disponible.
 *
 * Comment ça marche :
 *   Dans Baileys, le JID d'un participant contient un suffixe ":N"
 *   où N est le device ID. On le mappe vers les types d'appareils connus.
 *   Ex : "229XXXX:0@s.whatsapp.net" → appareil principal (smartphone)
 *        "229XXXX:1@s.whatsapp.net" → WhatsApp Web / Desktop
 */
const config = require('../../config.js');

const SC = t => {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

/**
 * Décode le type d'appareil depuis le JID Baileys.
 * Le suffixe ":N" après le numéro identifie l'appareil lié.
 */
function detectDeviceFromJid(jid) {
  if (!jid) return { device: 'Inconnu', icon: '❓', platform: 'N/A' };
  const raw = jid.split('@')[0];
  const parts = raw.split(':');
  const deviceId = parts.length > 1 ? parseInt(parts[1]) : 0;

  // Mapping officieux des device IDs Baileys
  const map = {
    0:  { device: 'Android / iPhone',  icon: '📱', platform: 'Mobile'  },
    1:  { device: 'WhatsApp Web',       icon: '🌐', platform: 'Browser' },
    2:  { device: 'WhatsApp Desktop',   icon: '🖥️', platform: 'Desktop' },
    3:  { device: 'WhatsApp Desktop',   icon: '🖥️', platform: 'Desktop' },
    4:  { device: 'WhatsApp Web / Beta',icon: '🌐', platform: 'Browser' },
    5:  { device: 'WhatsApp Business',  icon: '💼', platform: 'Mobile'  },
  };
  return map[deviceId] || { device: `Appareil #${deviceId}`, icon: '📲', platform: 'Autre' };
}

module.exports = {
  name: 'device', aliases: ['appareil', 'getdevice', 'dev', 'phone'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ᴛᴇᴄᴛᴇ ʟ\'ᴀᴘᴘᴀʀᴇɪʟ ᴅ\'ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ',
  usage: `${config.prefix||'.'}device [@mention / réponse]`,

  async execute(sock, msg, args, extra) {
    const { reply, from, sender, phrases } = extra;

    // ── Détection de la cible ─────────────────────────────
    const ctx       = msg.message?.extendedTextMessage?.contextInfo;
    let targetJid   = ctx?.mentionedJid?.[0] || ctx?.participant || sender;

    // Normaliser pour avoir le JID brut (avec device suffix si dispo)
    // Dans le participant du message cité, le JID contient :N
    const rawJid    = ctx?.participant || targetJid;
    const numero    = rawJid.split('@')[0].split(':')[0].replace(/\D/g,'');

    const { device, icon, platform } = detectDeviceFromJid(rawJid);

    // ── Infos supplémentaires ─────────────────────────────
    let ppUrl = null;
    try { ppUrl = await sock.profilePictureUrl(targetJid, 'image'); } catch (_) {}

    const caption =
      `╭╼≪• *${icon} ${SC('informations appareil')}* •≫╾╮\n` +
      `┃\n` +
      `┃ 📞 *${SC('numéro')}* : +${numero}\n` +
      `┃ ${icon} *${SC('appareil')}* : ${device}\n` +
      `┃ 💻 *${SC('plateforme')}* : ${platform}\n` +
      `┃\n` +
      `┃ ⚠️ _${SC('information basée sur le jid baileys')}_\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;

    if (ppUrl) {
      await sock.sendMessage(from, { image: { url: ppUrl }, caption }, { quoted: msg });
    } else {
      await reply(caption);
    }
  }
};
