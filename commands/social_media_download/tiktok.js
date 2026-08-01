/**
 * TikTok Downloader - THE BIG DIPPER
 * Télécharge des vidéos ou carrousels TikTok.
 * Version fusionnée : cascade de 6 fournisseurs, priorité HD systématique,
 * validation de taille du média, repli buffer→URL.
 */

const { ttdl } = require('ruhend-scraper');
const sessionContext = require('../../utils/sessionContext');
const axios = require('axios');
const APIs = require('../../utils/api');
const config = require('../../config');

// Stockage des ID de messages traités pour éviter les doublons
const processedMessages = new Set();

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

function getDomain(url) {
  try {
    const domain = new URL(url).hostname;
    return domain.replace('www.', '');
  } catch (e) {
    return 'tiktok.com';
  }
}

module.exports = {
  name: 'tiktok',
  aliases: ['illusions_tiktok', 'tt', 'ttdl', 'tiktokdl', 'illusion_tiktok', 'tkhd', 'tiktokpremium'],
  category: '📥 Téléchargements',
  description: '『 THE BIG DIPPER 』➪ ᴀsᴘɪʀᴇ ᴇᴛ ᴛᴇʟᴇᴄʜᴀʀɢᴇ ᴅᴇs ᴠɪᴅᴇᴏs ᴛɪᴋᴛᴏᴋ ᴇɴ ʜᴅ sᴀɴs ғɪʟɪɢʀᴀɴᴇ',
  usage: `${config.prefix || '.'}tiktok [lien tiktok]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const chatId = msg.key.remoteJid;
    const reply = async (text) => await sock.sendMessage(chatId, { text }, { quoted: msg });

    try {
      // 1️⃣ Sécurité anti-doublon
      if (processedMessages.has(sessionContext.scopeKey(msg.key.id))) return;
      processedMessages.add(sessionContext.scopeKey(msg.key.id));
      setTimeout(() => processedMessages.delete(sessionContext.scopeKey(msg.key.id)), 5 * 60 * 1000);

      const text = args.join(' ');

      if (!text) {
        return reply(
          `*⚠️ ${toSmallCaps('echec de l\'invocation')}*\n\n` +
          `*┃* 🔮 *${toSmallCaps('indique un lien tiktok')}*\n` +
          `*┃* *${toSmallCaps('pour aspirer le media')} !*\n\n` +
          extra.phrases.footer()
        );
      }

      const tiktokPatterns = [
        /https?:\/\/(?:www\.)?tiktok\.com\//,
        /https?:\/\/(?:vm\.)?tiktok\.com\//,
        /https?:\/\/(?:vt\.)?tiktok\.com\//,
        /https?:\/\/(?:www\.)?tiktok\.com\/@/,
        /https?:\/\/(?:www\.)?tiktok\.com\/t\//
      ];
      const isValidUrl = tiktokPatterns.some(pattern => pattern.test(text));

      if (!isValidUrl) {
        return reply(`*❌ ${toSmallCaps('ce lien nest pas une illusion tiktok valide')} !*\n\n${extra.phrases.footer()}`);
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

      try {
        let videoUrl = null;
        let title = null;
        const botName = toSmallCaps(config.botName || 'THE BIG DIPPER');
        const sourceDomain = getDomain(text);
        const errors = [];

        // ── API 1 : API personnalisée ────────────────────────────────────────
        try {
          const result = await APIs.getTikTokDownload(text);
          videoUrl = result.videoUrl;
          title = result.title;
        } catch (apiError) {
          errors.push(`API perso: ${apiError.message}`);
          console.error(`[tiktok] API perso échouée: ${apiError.message}`);
        }

        // ── API 2 : TikWM avec priorité HD systématique ─────────────────────
        if (!videoUrl) {
          try {
            const tikwmResponse = await axios.post(
              'https://www.tikwm.com/api/',
              new URLSearchParams({ url: text, hd: '1' }).toString(),
              {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 30000,
              }
            );
            if (tikwmResponse.data && tikwmResponse.data.data) {
              const resData = tikwmResponse.data.data;
              // Priorité systématique à la meilleure qualité disponible
              videoUrl = resData.hdplay || resData.play;
              title = resData.title;
            }
          } catch (tikwmErr) {
            errors.push(`TikWM: ${tikwmErr.message}`);
            console.error('[tiktok] TikWM échoué:', tikwmErr.message);
          }
        }

        // ── API 3 : Cobalt (api.cobalt.tools) ───────────────────────────────
        if (!videoUrl) {
          try {
            const cobaltRes = await axios.post('https://api.cobalt.tools/', {
              url: text,
              downloadMode: 'auto',
              videoQuality: 'max',
              tiktokH265: false,
            }, {
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (compatible; TheBigDipper/1.0)',
              },
              timeout: 35000,
            });
            const d = cobaltRes.data;
            if (d?.status === 'tunnel' || d?.status === 'redirect') {
              videoUrl = d.url;
            } else if (d?.status === 'picker' && Array.isArray(d?.picker)) {
              const vid = d.picker.find(p => p.type === 'video') || d.picker[0];
              videoUrl = vid?.url;
            } else if (d?.url) {
              videoUrl = d.url;
            }
            if (!videoUrl) errors.push(`Cobalt: status=${d?.status} — pas d'URL`);
          } catch (e1) {
            errors.push(`Cobalt: ${e1.message}`);
            console.warn('[tiktok] Cobalt échoué:', e1.message);
          }
        }

        // ── API 4 : SSSTik ───────────────────────────────────────────────────
        if (!videoUrl) {
          try {
            const sssTikRes = await axios.post(
              'https://ssstik.io/abc?url=dl',
              new URLSearchParams({ id: text, locale: 'en', tt: 'YUdwY0lS' }).toString(),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                  'Referer': 'https://ssstik.io/',
                  'Origin': 'https://ssstik.io',
                },
                timeout: 30000,
              }
            );
            const html = sssTikRes.data || '';
            const match = html.match(/href="(https:\/\/[^"]*?\.mp4[^"]*?)"/i)
                       || html.match(/href="(https:\/\/v[0-9][^"]*?)"/i);
            if (match?.[1]) {
              videoUrl = match[1].replace(/&amp;/g, '&');
            } else {
              errors.push('SSSTik: pas d\'URL dans le HTML');
            }
          } catch (e2) {
            errors.push(`SSSTik: ${e2.message}`);
            console.warn('[tiktok] SSSTik échoué:', e2.message);
          }
        }

        // ── API 5 : SnapTik ───────────────────────────────────────────────────
        if (!videoUrl) {
          try {
            const snapRes = await axios.post(
              'https://snaptik.app/abc2.php',
              new URLSearchParams({ url: text }).toString(),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                  'Referer': 'https://snaptik.app/',
                },
                timeout: 25000,
              }
            );
            const snapHtml = snapRes.data || '';
            const snapMatch = snapHtml.match(/href="(https:\/\/[^"]*?tiktok[^"]*?\.(mp4|m4v)[^"]*?)"/i);
            if (snapMatch?.[1]) {
              videoUrl = snapMatch[1].replace(/&amp;/g, '&');
            } else {
              errors.push('SnapTik: pas d\'URL dans le HTML');
            }
          } catch (e3) {
            errors.push(`SnapTik: ${e3.message}`);
            console.warn('[tiktok] SnapTik échoué:', e3.message);
          }
        }

        // ── API 6 : ttdl (scraper Ruhend) — géré séparément pour les carrousels ─
        if (!videoUrl) {
          try {
            let downloadData = await ttdl(text);
            if (downloadData && downloadData.data && downloadData.data.length > 0) {
              const mediaData = downloadData.data;

              for (let i = 0; i < Math.min(20, mediaData.length); i++) {
                const media = mediaData[i];
                const mediaUrl = media.url;
                const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || media.type === 'video';

                let mediaCaption = `*╭━≪• 🎬 ᴀsᴘɪʀᴀᴛɪᴏɴ ʀᴇ́ᴜssɪᴇ •≫╾╮*\n` +
                                   `*┃* 🔮 *${toSmallCaps('extrait par')} :* ${botName}\n` +
                                   `*┃* 🔗 *${toSmallCaps('source')} :* ${sourceDomain}\n`;

                if (downloadData.title) {
                  mediaCaption += `*┃* 🔖 *${toSmallCaps('titre')} :* ${toSmallCaps(downloadData.title)}\n\n`;
                } else {
                  mediaCaption += `\n`;
                }
                mediaCaption += extra.phrases.footer();

                if (isVideo) {
                  await sock.sendMessage(chatId, {
                    video: { url: mediaUrl }, mimetype: 'video/mp4', caption: mediaCaption
                  }, { quoted: msg });
                } else {
                  await sock.sendMessage(chatId, {
                    image: { url: mediaUrl }, caption: mediaCaption
                  }, { quoted: msg });
                }
              }
              await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
              return;
            }
          } catch (ttdlError) {
            errors.push(`ttdl: ${ttdlError.message}`);
            console.error('[tiktok] ttdl échoué:', ttdlError.message);
          }
        }

        // ── Aucune source n'a fonctionné ─────────────────────────────────────
        if (!videoUrl) {
          console.error('[tiktok] Toutes les sources ont échoué:', errors);
          await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
          return reply(`*❌ ${toSmallCaps('toutes les sources dinvocation ont echoue pour cette illusion')} !*\n\n${extra.phrases.footer()}`);
        }

        // ── Téléchargement + validation + envoi ──────────────────────────────
        let caption = `*╭╼━━━≪• 🎬 ᴀsᴘɪʀᴀᴛɪᴏɴ ʀᴇ́ᴜssɪᴇ •≫━━━╾╮*\n` +
                      `*┃* 🔮 *${toSmallCaps('extrait par')} :* ${botName}\n` +
                      `*┃* 🔗 *${toSmallCaps('source')} :* ${sourceDomain}\n`;
        if (title) {
          caption += `*┃* 🔖 *${toSmallCaps('titre')} :* ${toSmallCaps(title)}\n\n`;
        } else {
          caption += `\n`;
        }
        caption += extra.phrases.footer();

        try {
          const videoResponse = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            timeout: 120000, // aligné sur la valeur la plus généreuse (tiktokhd)
            maxContentLength: 100 * 1024 * 1024,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Accept': 'video/mp4,video/*,*/*;q=0.9',
              'Referer': 'https://www.tiktok.com/'
            }
          });

          const videoBuffer = Buffer.from(videoResponse.data);

          // Validation de taille minimale (détecte une URL expirée/invalide)
          if (videoBuffer.length < 5000) {
            throw new Error(`Fichier trop petit (${videoBuffer.length} bytes) — URL invalide ou expirée`);
          }

          await sock.sendMessage(chatId, {
            video: videoBuffer, mimetype: 'video/mp4', caption: caption
          }, { quoted: msg });
          await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
          return;
        } catch (downloadError) {
          console.error(`[tiktok] Échec téléchargement buffer: ${downloadError.message}`);
          // Repli : envoi par URL directe
          try {
            await sock.sendMessage(chatId, {
              video: { url: videoUrl }, mimetype: 'video/mp4', caption: caption
            }, { quoted: msg });
            await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } });
            return;
          } catch (urlError) {
            console.error(`[tiktok] Méthode URL directe également échouée: ${urlError.message}`);
          }
        }

        return reply(`*❌ ${toSmallCaps('toutes les sources dinvocation ont echoue pour cette illusion')} !*\n\n${extra.phrases.footer()}`);

      } catch (error) {
        console.error('[tiktok] Erreur:', error);
        await reply(`*❌ ${toSmallCaps('loracle a echoue a sonder ce lien tiktok')} !*\n\n${extra.phrases.footer()}`);
      }
    } catch (error) {
      console.error('[tiktok] Erreur commande:', error);
      await reply(`*❌ ${toSmallCaps('une singularite est survenue lors du traitement')}...*\n\n${extra.phrases.footer()}`);
    }
  }
};
