'use strict';

const config = require('../config');
const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

const BOT_URL = 'https://the-big-dipper.onrender.com';
const POWERED_FOOTER = '> Powered by 🌹 Mr Tresor 🌹';

async function resolveOwnerThumb(sock) {
  try {
    const { resolveOwnerProfileThumbnail } = require('./specialPresentation');
    return await resolveOwnerProfileThumbnail(sock);
  } catch (_) { return null; }
}

async function buildConnectionContext(sock, { title, body, sourceUrl = BOT_URL } = {}) {
  const thumbnail = await resolveOwnerThumb(sock);
  const contextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
      newsletterName: config.botName || 'THE BIG DIPPER',
      serverMessageId: -1,
    },
    externalAdReply: {
      showAdAttribution: false,
      title: title || config.botName || 'THE BIG DIPPER',
      body: body || 'Powered by 🌹 Mr Tresor 🌹',
      mediaType: 1,
      sourceUrl,
      mediaUrl: sourceUrl,
      renderLargerThumbnail: false,
    },
  };
  if (Buffer.isBuffer(thumbnail) && thumbnail.length > 1000) contextInfo.externalAdReply.thumbnail = thumbnail;
  return contextInfo;
}

function urlButton(label, url) {
  return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: String(label || 'Ouvrir'), url: String(url || BOT_URL), merchant_url: String(url || BOT_URL) }) };
}

async function sendCtaMessage(sock, jid, { text, title, body, buttons = [], sourceUrl = BOT_URL, quoted = null, includeFooter = false } = {}) {
  const contextInfo = await buildConnectionContext(sock, { title, body, sourceUrl });
  const finalText = includeFooter && !String(text || '').includes(POWERED_FOOTER)
    ? `${String(text || '').trim()}\n\n${POWERED_FOOTER}` : String(text || '');
  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text: finalText }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header: proto.Message.InteractiveMessage.Header.create({ title: '', subtitle: '', hasMediaAttachment: false }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: buttons.slice(0, 8).map(b => urlButton(b.label, b.url)), messageParamsJson: '{}', messageVersion: 1 }),
    contextInfo,
  });
  try {
    const generated = generateWAMessageFromContent(jid, { interactiveMessage }, { quoted: quoted || undefined, userJid: sock.user?.id });
    await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });
    return generated;
  } catch (error) {
    const links = buttons.map(b => `• ${b.label}: ${b.url}`).join('\n');
    return sock.sendMessage(jid, { text: [finalText, links].filter(Boolean).join('\n\n'), contextInfo }, quoted ? { quoted } : undefined);
  }
}

module.exports = { BOT_URL, POWERED_FOOTER, buildConnectionContext, sendCtaMessage };
