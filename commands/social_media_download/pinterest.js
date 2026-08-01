/**
 * Pinterest Downloader - 𝐃𝐚𝐫𝐤 Edition
 * Télécharge des images ou des vidéos depuis l'univers Pinterest
 */

const axios = require('axios');
const sessionContext = require('../../utils/sessionContext');
const config = require('../../config');

// Stockage des ID de messages traités pour éviter les doublons
const processedMessages = new Set();

// Fonction pour le style Small Caps (Cohérence visuelle du sanctuaire)
function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

  const cleanedText = text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 

  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

// Fonction pour extraire proprement le domaine source
function getDomain(url) {
  try {
    const domain = new URL(url).hostname;
    return domain.replace('www.', '');
  } catch (e) {
    return 'pinterest.com';
  }
}

module.exports = {
  name: 'pinterest',
  aliases: ['illusions_pinterest', 'pin', 'pindl', 'pinterestdl', 'illusion_pinterest'],
  category: '📥 Téléchargements',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀsᴘɪʀᴇ ᴇᴛ ᴛᴇʟᴇᴄʜᴀʀɢᴇ ᴅᴇs ɪᴍᴀɢᴇs/ᴠɪᴅᴇᴏs ᴘɪɴᴛᴇʀᴇsᴛ',
  usage: `${config.prefix || '.'}pinterest [lien pinterest]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;
    const prefix = config.prefix || '.';

    try {
      const chatId = extra.from;

      // 1️⃣ Sécurité anti-doublon
      if (processedMessages.has(sessionContext.scopeKey(msg.key.id))) return;
      processedMessages.add(sessionContext.scopeKey(msg.key.id));
      setTimeout(() => processedMessages.delete(sessionContext.scopeKey(msg.key.id)), 5 * 60 * 1000);

      const text = args.join(' ');

      if (!text) {
        return reply(
          `*⚠️ ${toSmallCaps('echec de l\'invocation')}*\n\n` +
          `*┃* 🔮 *${toSmallCaps('indique un lien pinterest')}*\n` +
          `*┃* *${toSmallCaps('pour aspirer le media')} !*\n\n` +
          extra.phrases.footer()
        );
      }

      // Extraction de l'URL Pinterest (y compris les liens raccourcis pin.it)
      let urlMatch = text.match(/https?:\/\/[^\s]*pinterest[^\s]*\/pin\/[^\s]+/i);
      if (!urlMatch) urlMatch = text.match(/https?:\/\/pin\.it\/[^\s]+/i);
      if (!urlMatch) urlMatch = text.match(/pin\.it\/[^\s]+/i);

      if (!urlMatch) {
        return reply(`*❌ ${toSmallCaps('murmure un lien pinterest valide')} !*\n\n${extra.phrases.footer()}`);
      }

      const pinterestUrl = urlMatch[0];

      // Réaction avec l'orbe de téléchargement
      await sock.sendMessage(chatId, {
        react: { text: '⏳', key: msg.key }
      });

      // Appel de l'API Pinterest
      const apiUrl = `https://api.nexray.web.id/downloader/pinterest?url=${encodeURIComponent(pinterestUrl)}`;

      let response;
      try {
        response = await axios.get(apiUrl, {
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
      } catch (error) {
        console.error('Pinterest API Error:', error);
        if (error.response) {
          const status = error.response.status;
          if (status === 400) return reply(`*❌ ${toSmallCaps('lien pinterest invalide. verifie lurl soumise')} !*\n\n${extra.phrases.footer()}`);
          if (status === 429) return reply(`*❌ ${toSmallCaps('limitation des arcanes atteinte. reessaie plus tard')} !*\n\n${extra.phrases.footer()}`);
          if (status === 500) return reply(`*❌ ${toSmallCaps('le serveur est instable. reessaie plus tard')} !*\n\n${extra.phrases.footer()}`);
        }
        return reply(`*❌ ${toSmallCaps('loracle a echoue a sonder ce lien pinterest')} !*\n\n${extra.phrases.footer()}`);
      }

      if (!response.data || !response.data.status || !response.data.result) {
        return reply(`*❌ ${toSmallCaps('reponse de serveur invalide. le pin est peut-etre prive')} !*\n\n${extra.phrases.footer()}`);
      }

      const pinData = response.data.result;

      const isVideo = !!pinData.video;
      const imageUrl = pinData.video || pinData.image || pinData.url;
      const title = pinData.title || 'Pinterest Pin';
      const author = pinData.author || 'Inconnu';

      if (!imageUrl) {
        return reply(`*❌ ${toSmallCaps('aucun media trouve dans les donnees de serveur')} !*\n\n${extra.phrases.footer()}`);
      }

      const botName = toSmallCaps(config.botName || 'ɢʜᴏsᴛɢ-x');
      const sourceDomain = getDomain(pinterestUrl);

      // Construction de la légende
      let caption = `*╭╼≪• 🎬 ᴀsᴘɪʀᴀᴛɪᴏɴ ʀᴇ́ᴜssɪᴇ •≫╾╮*\n` +
                    `*┃* 🔮 *${toSmallCaps('extrait par')} :* ${botName}\n` +
                    `*┃* 🔗 *${toSmallCaps('source')} :* ${sourceDomain}\n` +
                    `*┃* 🔖 *${toSmallCaps('titre')} :* ${toSmallCaps(title)}\n`;

      if (author && author !== 'Inconnu') {
        caption += `*┃* 👤 *${toSmallCaps('auteur')} :* ${toSmallCaps(author)}\n\n`;
      } else {
        caption += `\n`;
      }

      caption += extra.phrases.footer();

      // Envoi du média principal
      if (isVideo) {
        try {
          const videoResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 120000, 
            maxContentLength: 100 * 1024 * 1024, 
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'video/mp4,video/*,*/*',
              'Referer': 'https://www.pinterest.com/'
            }
          });

          const videoBuffer = Buffer.from(videoResponse.data);

          await sock.sendMessage(chatId, {
            video: videoBuffer,
            caption: caption
          }, { quoted: msg });
        } catch (videoError) {
          console.error('Video download/send error:', videoError.message);
          return reply(`*❌ ${toSmallCaps('lenvoi de lillusion video a echoue. le lien a peut-etre expire')} !*\n\n${extra.phrases.footer()}`);
        }
      } else {
        await sock.sendMessage(chatId, {
          image: { url: imageUrl },
          caption: caption
        }, { quoted: msg });
      }

    } catch (error) {
      console.error('Error in pinterest command:', error);
      return reply(`*❌ ${toSmallCaps('linvocation a echoue')} : ${error.message || 'ᴇʀʀᴇᴜʀ ɪɴᴄᴏɴɴᴜᴇ'}*\n\n${extra.phrases.footer()}`);
    }
  },
};
