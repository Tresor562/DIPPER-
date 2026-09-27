'use strict';

const config = require('../../config');
const { renderDashboardCard, sendRichCard } = require('../../utils/nexaiRichUi');

module.exports = {
  name: 'nexui',
  aliases: ['ui', 'miniapp', 'panel', 'arcade'],
  category: '🛠️ Outils généraux',
  description: 'Ouvre l’interface visuelle NexAI pour WhatsApp.',
  usage: `${config.prefix || '.'}nexui`,
  async execute(sock, msg, args, extra) {
    const image = await renderDashboardCard({
      subtitle: 'Interface visuelle NexAI : jeux interactifs, téléchargements riches et accès rapide aux fonctions du bot.',
      session: sock?._sessionPhoneNumber ? `CONNECTED • +${String(sock._sessionPhoneNumber).replace(/\D/g, '')}` : 'CONNECTED',
    });
    return sendRichCard({
      sock,
      jid: extra.from,
      imageBuffer: image,
      caption: '⚡ *NexAI Mini System*\nChoisis un module ci-dessous.',
      footer: 'NEXAI • WHATSAPP RICH UI',
      quoted: extra.from?.endsWith('@g.us') ? msg : null,
      buttons: [
        { text: '🐍 Cyber Snake', id: 'nexui:dashboard:snake' },
        { text: '🀄 Domino', id: 'nexui:dashboard:domino' },
        { text: '📋 Menu', id: 'nexui:dashboard:menu' },
        { text: '🎬 TikTok', id: 'nexui:dashboard:tiktok' },
      ],
      fallbackLines: [
        `${config.prefix || '.'}snake new`,
        `${config.prefix || '.'}domino new`,
        `${config.prefix || '.'}menu`,
        `${config.prefix || '.'}tiktok <lien>`,
      ],
    });
  },
};
