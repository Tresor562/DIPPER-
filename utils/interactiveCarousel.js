'use strict';

const { proto, prepareWAMessageMedia, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).filter(item => item && (item.mediaUrl || item.image || item.video)).slice(0, 10).map((item, index) => ({
    type: item.type === 'video' ? 'video' : 'image',
    mediaUrl: item.mediaUrl || item.video || item.image,
    title: String(item.title || `Résultat ${index + 1}`).slice(0, 180),
    body: String(item.body || '').slice(0, 500),
    url: item.url ? String(item.url) : '',
  }));
}

function cardButtons(item) {
  if (!item.url) return [];
  return [{ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🔗 Ouvrir', url: item.url, merchant_url: item.url }) }];
}

async function buildCard(sock, item) {
  const mediaInput = item.type === 'video' ? { video: { url: item.mediaUrl } } : { image: { url: item.mediaUrl } };
  const prepared = await prepareWAMessageMedia(mediaInput, { upload: sock.waUploadToServer });
  return proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text: [item.title, item.body].filter(Boolean).join('\n') }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header: proto.Message.InteractiveMessage.Header.create({ ...prepared, title: '', subtitle: '', hasMediaAttachment: true }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: cardButtons(item), messageParamsJson: '{}', messageVersion: 1 }),
  });
}

async function sendFallback(sock, jid, title, items, quoted) {
  const sent = [];
  for (const item of items.slice(0, 6)) {
    const media = item.type === 'video' ? { video: { url: item.mediaUrl }, caption: item.title } : { image: { url: item.mediaUrl }, caption: item.title };
    try { sent.push(await sock.sendMessage(jid, media, quoted ? { quoted } : undefined)); } catch (_) {}
  }
  if (!sent.length) return sock.sendMessage(jid, { text: `${title || 'Résultats'}\n\nImpossible d'afficher le carrousel pour le moment.` }, quoted ? { quoted } : undefined);
  return sent;
}

async function sendMediaCarousel(sock, jid, { title = 'Résultats', subtitle = '', items = [], quoted = null, contextInfo = undefined } = {}) {
  const normalized = normalizeItems(items);
  if (!normalized.length) throw new Error('Aucun média valide pour le carrousel.');
  try {
    const cards = [];
    for (const item of normalized) cards.push(await buildCard(sock, item));
    const factory = proto.Message.InteractiveMessage.CarouselMessage;
    const carouselMessage = typeof factory?.fromObject === 'function' ? factory.fromObject({ cards }) : factory.create({ cards });
    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: [title, subtitle].filter(Boolean).join('\n') }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
      header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
      carouselMessage,
      contextInfo,
    });
    const generated = generateWAMessageFromContent(jid, { viewOnceMessage: { message: { messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 }, interactiveMessage } } }, { quoted: quoted || undefined, userJid: sock.user?.id });
    await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });
    return generated;
  } catch (error) {
    console.warn('[carousel] fallback séquentiel:', error.message);
    return sendFallback(sock, jid, title, normalized, quoted);
  }
}

module.exports = { normalizeItems, sendMediaCarousel };
