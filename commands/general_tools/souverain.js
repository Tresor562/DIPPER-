'use strict';

const config = require('../../config');
const { resolveOwnerProfileThumbnail } = require('../../utils/specialPresentation');

const OWNER_NAME = '𝐌ꝛ⥔𝕿𝖗𝖊𝖘𝖔𝖗 🌹';
const OWNER_PHONE = '2290146202259';
const BOT_URL = 'https://the-big-dipper.onrender.com';
const TELEGRAM_URL = 'https://t.me/tresor20009';
const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=100078681750878';
const TIKTOK_URL = 'https://www.tiktok.com/@tresor20001';
const INSTAGRAM_URL = 'https://www.instagram.com/tresorhtn';
const NEXUS_TECH_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';

function buildVcard() {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${OWNER_NAME}`,
    'N:Tresor;Mr;;;',
    'ORG:Nexus Tech;',
    'TITLE:Creator & Developer — THE BIG DIPPER',
    `TEL;type=CELL;type=VOICE;waid=${OWNER_PHONE}:+${OWNER_PHONE}`,
    `URL;type=WHATSAPP:https://wa.me/${OWNER_PHONE}`,
    `URL;type=TELEGRAM:${TELEGRAM_URL}`,
    `URL;type=FACEBOOK:${FACEBOOK_URL}`,
    `URL;type=TIKTOK:${TIKTOK_URL}`,
    `URL;type=INSTAGRAM:${INSTAGRAM_URL}`,
    `URL;type=NEXUSTECH:${NEXUS_TECH_URL}`,
    `URL;type=BOT:${BOT_URL}`,
    'END:VCARD',
  ].join('\n');
}

function contextInfo(thumbnail) {
  const info = {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
      newsletterName: config.botName || 'THE BIG DIPPER',
      serverMessageId: -1,
    },
    externalAdReply: {
      showAdAttribution: false,
      title: OWNER_NAME,
      body: 'Créateur de THE BIG DIPPER • Nexus Tech',
      mediaType: 1,
      sourceUrl: BOT_URL,
      mediaUrl: BOT_URL,
      renderLargerThumbnail: false,
    },
  };
  if (Buffer.isBuffer(thumbnail) && thumbnail.length > 1000) info.externalAdReply.thumbnail = thumbnail;
  return info;
}

module.exports = {
  name: 'owner',
  aliases: ['souverain', 'creator', 'souverain_dev', 'developpeur', 'maitre', 'developper', 'architecte', 'king'],
  category: '🛠️ Outils généraux',
  description: 'Affiche le contact officiel du créateur de THE BIG DIPPER.',
  usage: `${config.prefix || '.'}owner`,
  ownerOnly: false,
  groupOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const jid = extra?.from || msg?.key?.remoteJid;
    if (!jid) return;
    try {
      const thumbnail = await resolveOwnerProfileThumbnail(sock).catch(() => null);
      // Une seule réponse propre : pas d'introduction théâtrale, pas de second
      // message, pas de délai. Toutes les coordonnées restent dans la vCard.
      return await sock.sendMessage(jid, {
        contacts: {
          displayName: OWNER_NAME,
          contacts: [{ displayName: OWNER_NAME, vcard: buildVcard() }],
        },
        contextInfo: contextInfo(thumbnail),
      }, jid.endsWith('@g.us') ? { quoted: msg } : undefined);
    } catch (error) {
      console.error('[owner] envoi contact échoué:', error.message);
      return extra.reply(`🌹 ${OWNER_NAME}\n📱 +${OWNER_PHONE}\n🌐 ${BOT_URL}`);
    }
  },
};
