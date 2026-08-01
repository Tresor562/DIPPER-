/**
 * Video Downloader - 𝐃𝐚𝐫𝐤 Edition
 * Télécharge l'essence vidéo depuis l'univers YouTube
 */

const yts = require('yt-search');
const APIs = require('../../utils/api');
const config = require('../../config');

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
    return 'youtube.com';
  }
}

module.exports = {
  name: 'video',
  aliases: ['illusions_youtube', 'ytvideo', 'ytv', 'ytmp4', 'ytvid', 'illusion_youtube', 'dlyoutube'],
  category: '📥 Téléchargements',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀsᴘɪʀᴇ ᴇᴛ ᴛᴇʟᴇᴄʜᴀʀɢᴇ ʟᴀ ᴠɪᴅᴇᴏ ᴅᴇᴘᴜɪs ʏᴏᴜᴛᴜʙᴇ',
  usage: `${config.prefix || '.'}video [nom ou lien youtube]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  // ✅ [FIX] extra ajouté — était absent, causait ReferenceError sur extra.phrases.footer()
  async execute(sock, msg, args, extra) {
    const chatId = msg.key.remoteJid;
    const reply = async (text) => sock.sendMessage(chatId, { text }, { quoted: msg });

    try {
      const botName = toSmallCaps(config.botName || 'ɢʜᴏsᴛɢ-x');
      const text = args.join(' ');
      const searchQuery = text.trim();

      if (!searchQuery) {
        return reply(
          `*⚠️ ${toSmallCaps('echec de l\'invocation')}*\n\n` +
          `*┃* 🔮 *${toSmallCaps('indique un nom ou un lien')}*\n` +
          `*┃* *${toSmallCaps('pour aspirer le media')} !*\n\n` +
          extra.phrases.footer()
        );
      }

      let videoUrl = '';
      let videoTitle = '';
      let videoThumbnail = '';

      if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
        videoUrl = searchQuery;
        videoTitle = 'Lien Direct';
      } else {
        // Recherche de la vidéo sur YouTube
        const { videos } = await yts(searchQuery);
        if (!videos || videos.length === 0) {
          return reply(`*❌ ${toSmallCaps('aucune video trouvee dans les archives')}.*\n\n${extra.phrases.footer()}`);
        }
        videoUrl = videos[0].url;
        videoTitle = videos[0].title;
        videoThumbnail = videos[0].thumbnail;
      }

      const sourceDomain = getDomain(videoUrl);

      // 1️⃣ Envoi immédiat de la miniature avec l'esthétique du sanctuaire (Serré)
      try {
        const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
        const captionTitle = videoTitle || searchQuery;

        if (thumb) {
          await sock.sendMessage(chatId, {
            image: { url: thumb },
            caption: `*╭╼≪• 🎬 ᴀsᴘɪʀᴀᴛɪᴏɴ ᴇɴ ᴄᴏᴜʀs •≫╾╮*\n` +
                     `*┃* 🔮 *${toSmallCaps('extrait par')} :* ${botName}\n` +
                     `*┃* 🔗 *${toSmallCaps('source')} :* ${sourceDomain}\n` +
                     `*┃* 🔖 *${toSmallCaps('titre')} :* ${toSmallCaps(captionTitle)}\n\n` +
                     extra.phrases.footer()
          }, { quoted: msg });
        }
      } catch (e) {
        console.error('[VIDEO] thumb error:', e?.message || e);
      }

      // Validation de l'URL YouTube
      let urls = videoUrl.match(/(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi);
      if (!urls) {
        return reply(`*❌ ${toSmallCaps('ce lien nest pas une illusion youtube valide')} !*\n\n${extra.phrases.footer()}`);
      }

      // Réaction avec l'orbe de téléchargement
      await sock.sendMessage(chatId, {
        react: { text: '⏳', key: msg.key }
      });

      // Récupération de la vidéo : EliteProTech d'abord, puis Yupra, puis Okatsu en repli
      let videoData;
      try {
        videoData = await APIs.getEliteProTechVideoByUrl(videoUrl);
      } catch (e1) {
        try {
          videoData = await APIs.getYupraVideoByUrl(videoUrl);
        } catch (e2) {
          videoData = await APIs.getOkatsuVideoByUrl(videoUrl);
        }
      }

      if (!videoData || !videoData.download) {
        throw new Error('No download URL returned by APIs');
      }

      // 2️⃣ Envoi de l'artefact vidéo finalisé
      await sock.sendMessage(chatId, {
        video: { url: videoData.download },
        mimetype: 'video/mp4',
        fileName: `${(videoData.title || videoTitle || 'video').replace(/[^\w\s-]/g, '')}.mp4`,
        caption: `*╭━≪• 🎬 ᴀsᴘɪʀᴀᴛɪᴏɴ ʀᴇ́ᴜssɪᴇ •≫╾╮*\n` +
                 `*┃* 🔮 *${toSmallCaps('extrait par')} :* ${botName}\n` +
                 `*┃* 🔗 *${toSmallCaps('source')} :* ${sourceDomain}\n` +
                 `*┃* 🔖 *${toSmallCaps('titre')} :* ${toSmallCaps(videoData.title || videoTitle || 'Video')}\n` +
                 `*┃* 📊 *${toSmallCaps('statut')} :* ᴀᴄᴛɪғ\n\n` +
                 extra.phrases.footer()
      }, { quoted: msg });

    } catch (error) {
      console.error('[VIDEO] Command Error:', error?.message || error);
      await reply(`*❌ ${toSmallCaps('loracle a echoue')} : ${toSmallCaps(error?.message || 'erreur inconnue')}*\n\n${extra.phrases.footer()}`);
    }
  }
};
