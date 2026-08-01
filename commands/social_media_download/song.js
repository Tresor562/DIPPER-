/**
 * Song Downloader - 𝐃𝐚𝐫𝐤 Edition
 * Télécharge l'essence audio depuis l'univers YouTube
 *
 * === CORRECTIONS APPLIQUÉES ===
 * [FIX 1] execute(sock, msg, args) → execute(sock, msg, args, extra)
 *         'extra' était absent → extra.phrases.footer() crashait silencieusement
 * [FIX 2] Ajout de logs détaillés à chaque étape critique
 * [FIX 3] Timeout global anti-crash (90s max total)
 * [FIX 4] Validation URL YouTube avant envoi aux APIs
 * [FIX 5] Protection buffer vide / null après chaque étape
 * [FIX 6] Fallback footer sécurisé si extra non disponible
 * [FIX 7] Ajout API Izumi par query (sans URL YT) pour recherche texte
 */

const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const APIs = require('../../utils/api');
const { toAudio } = require('../../utils/converter');
const config = require('../../config.js');
const tempManager = require('../../utils/tempManager');

const AXIOS_DEFAULTS = {
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
};

// Timeout global : protège contre un hang infini
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`[TIMEOUT] ${label} dépasse ${ms}ms`)), ms)
    )
  ]);

// Style Small Caps
function toSmallCaps(text) {
  const normal   = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split('').map(c => {
      const i = normal.indexOf(c);
      return i !== -1 ? smallCaps[i] : c;
    }).join('');
}

// Extraire le domaine proprement
function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'youtube.com';
  }
}

// [FIX 6] Footer sécurisé — ne crashe jamais si extra est absent
function safeFooter(extra) {
  try {
    return extra?.phrases?.footer?.() || '';
  } catch {
    return '';
  }
}

// Valider qu'une URL est bien YouTube
function isYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

module.exports = {
  name: 'song',
  aliases: ['play', 'dlmusic', 'yta', 'cantique_youtube'],
  category: '📥 Téléchargements',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴏᴡɴʟᴏᴀᴅ ᴀᴜᴅɪᴏ ғʀᴏᴍ ʏᴏᴜᴛᴜʙᴇ',
  usage: `${config.prefix || '.'}song [nom ou lien youtube]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  // ✅ [FIX 1] 'extra' ajouté — était manquant, causait un crash ReferenceError
  async execute(sock, msg, args, extra) {
    const chatId = msg.key.remoteJid;
    const reply  = async (text) => sock.sendMessage(chatId, { text }, { quoted: msg });

    console.log('[SONG] ▶ Commande déclenchée');

    try {
      const text = args.join(' ').trim();

      if (!text) {
        console.log('[SONG] ⚠ Aucun argument fourni');
        return await sock.sendMessage(chatId, {
          text: `*⚠️ ${toSmallCaps("echec de l'invocation")}*\n\n` +
                `*┃* 🔮 *${toSmallCaps('indique un nom ou un lien')}*\n` +
                `*┃* *${toSmallCaps('pour aspirer le media')} !*\n\n` +
                safeFooter(extra)
        }, { quoted: msg });
      }

      let video;

      // [FIX 4] Validation stricte des URLs YouTube
      if (text.startsWith('http://') || text.startsWith('https://')) {
        if (!isYouTubeUrl(text)) {
          console.log('[SONG] ⚠ URL non-YouTube fournie:', text);
          return await reply(
            `*❌ ${toSmallCaps('lien invalide — seuls les liens youtube sont acceptes')} !*\n\n` +
            safeFooter(extra)
          );
        }
        console.log('[SONG] 🔗 Lien YouTube direct détecté');
        video = { url: text, title: 'Lien Direct', thumbnail: null, timestamp: null };
      } else {
        // Recherche YouTube
        console.log('[SONG] 🔍 Recherche YouTube pour:', text);
        let search;
        try {
          search = await withTimeout(yts(text), 15000, 'yt-search');
        } catch (searchErr) {
          console.error('[SONG] ❌ Échec yt-search:', searchErr.message);
          throw new Error('La recherche YouTube a échoué : ' + searchErr.message);
        }

        if (!search?.videos?.length) {
          console.log('[SONG] ⚠ Aucun résultat trouvé');
          return await reply(
            `*❌ ${toSmallCaps('aucun resultat trouve dans les archives')}.*\n\n` +
            safeFooter(extra)
          );
        }
        video = search.videos[0];
        console.log('[SONG] ✅ Résultat trouvé:', video.title, '| URL:', video.url);
      }

      const botName     = toSmallCaps(config.botName || 'ɢʜᴏsᴛɢ-x');
      const sourceDomain = getDomain(video.url || '');

      // Affichage info avant téléchargement
      await sock.sendMessage(chatId, {
        image: { url: video.thumbnail || 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png' },
        caption:
          `*╭━≪• 🎬 ᴀsᴘɪʀᴀᴛɪᴏɴ ʀᴇ́ᴜssɪᴇ •≫╾╮*\n` +
          `*┃* 🔮 *${toSmallCaps('extrait par')} :* ${botName}\n` +
          `*┃* 🔗 *${toSmallCaps('source')} :* ${sourceDomain}\n` +
          `*┃* 🔖 *${toSmallCaps('titre')} :* ${toSmallCaps(video.title || 'Inconnu')}\n` +
          `*┃* ⏱️ *${toSmallCaps('duree')} :* ${toSmallCaps(video.timestamp || 'Inconnue')}\n\n` +
          safeFooter(extra)
      }, { quoted: msg });

      await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

      // === CHAÎNE DE TÉLÉCHARGEMENT ===
      let audioData;
      let audioBuffer;
      let downloadSuccess = false;

      // [FIX 7] Si c'est une recherche texte (pas URL), on tente Izumi query en priorité
      const isDirectUrl = isYouTubeUrl(video.url || '');

      const apiMethods = isDirectUrl
        ? [
            { name: 'EliteProTech', method: () => APIs.getEliteProTechDownloadByUrl(video.url) },
            { name: 'Yupra',        method: () => APIs.getYupraDownloadByUrl(video.url)        },
            { name: 'Okatsu',       method: () => APIs.getOkatsuDownloadByUrl(video.url)       },
            { name: 'Izumi',        method: () => APIs.getIzumiDownloadByUrl(video.url)        }
          ]
        : [
            { name: 'IzumiQuery',   method: () => APIs.getIzumiDownloadByQuery(text)           },
            { name: 'EliteProTech', method: () => APIs.getEliteProTechDownloadByUrl(video.url) },
            { name: 'Yupra',        method: () => APIs.getYupraDownloadByUrl(video.url)        },
            { name: 'Okatsu',       method: () => APIs.getOkatsuDownloadByUrl(video.url)       },
            { name: 'Izumi',        method: () => APIs.getIzumiDownloadByUrl(video.url)        }
          ];

      for (const apiMethod of apiMethods) {
        console.log(`[SONG] 🌐 Tentative API : ${apiMethod.name}`);
        try {
          audioData = await withTimeout(apiMethod.method(), 30000, `API ${apiMethod.name}`);

          const audioUrl = audioData?.download || audioData?.dl || audioData?.url;
          if (!audioUrl) {
            console.log(`[SONG] ⚠ ${apiMethod.name} : pas d'URL de téléchargement, API suivante...`);
            continue;
          }

          console.log(`[SONG] 📥 ${apiMethod.name} → URL obtenue :`, audioUrl.substring(0, 80) + '...');

          // Tentative arraybuffer
          try {
            const audioResponse = await withTimeout(
              axios.get(audioUrl, {
                responseType: 'arraybuffer',
                timeout: 90000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                decompress: true,
                validateStatus: s => s >= 200 && s < 400,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Accept': '*/*',
                  'Accept-Encoding': 'identity'
                }
              }),
              90000,
              'téléchargement arraybuffer'
            );
            audioBuffer = Buffer.from(audioResponse.data);
            if (audioBuffer?.length > 0) {
              console.log(`[SONG] ✅ ${apiMethod.name} arraybuffer OK — ${audioBuffer.length} octets`);
              downloadSuccess = true;
              break;
            }
          } catch (downloadErr) {
            const statusCode = downloadErr.response?.status;
            console.log(`[SONG] ⚠ ${apiMethod.name} arraybuffer échoué (${statusCode || downloadErr.message}), tentative stream...`);

            if (statusCode === 451) {
              console.log(`[SONG] 🔒 ${apiMethod.name} : contenu bloqué (451), API suivante`);
              continue;
            }

            // Tentative stream
            try {
              const audioResponse = await withTimeout(
                axios.get(audioUrl, {
                  responseType: 'stream',
                  timeout: 90000,
                  maxContentLength: Infinity,
                  maxBodyLength: Infinity,
                  validateStatus: s => s >= 200 && s < 400,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': '*/*',
                    'Accept-Encoding': 'identity'
                  }
                }),
                90000,
                'téléchargement stream'
              );
              const chunks = [];
              await new Promise((resolve, reject) => {
                audioResponse.data.on('data',  c  => chunks.push(c));
                audioResponse.data.on('end',   resolve);
                audioResponse.data.on('error', reject);
              });
              audioBuffer = Buffer.concat(chunks);
              if (audioBuffer?.length > 0) {
                console.log(`[SONG] ✅ ${apiMethod.name} stream OK — ${audioBuffer.length} octets`);
                downloadSuccess = true;
                break;
              }
            } catch (streamErr) {
              const sc = streamErr.response?.status;
              console.log(`[SONG] ❌ ${apiMethod.name} stream échoué (${sc || streamErr.message})`);
              if (sc === 451) continue;
              continue;
            }
          }
        } catch (apiErr) {
          console.log(`[SONG] ❌ API ${apiMethod.name} échouée :`, apiErr.message);
          continue;
        }
      }

      // [FIX 5] Vérification finale du buffer
      if (!downloadSuccess || !audioBuffer || audioBuffer.length === 0) {
        throw new Error('Toutes les sources ont échoué. Le contenu est peut-être indisponible ou géo-bloqué.');
      }

      console.log(`[SONG] 🔎 Buffer téléchargé : ${audioBuffer.length} octets — détection format...`);

      // Détection format réel
      const firstBytes    = audioBuffer.slice(0, 12);
      const hexSignature  = firstBytes.toString('hex');
      const asciiSignature = firstBytes.toString('ascii', 4, 8);
      let fileExtension   = 'mp3';

      if (asciiSignature === 'ftyp' || hexSignature.startsWith('000000')) {
        const ftypBox = audioBuffer.slice(4, 8).toString('ascii');
        if (ftypBox === 'ftyp') fileExtension = 'm4a';
      } else if (
        audioBuffer.toString('ascii', 0, 3) === 'ID3' ||
        (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0)
      ) {
        fileExtension = 'mp3';
      } else if (audioBuffer.toString('ascii', 0, 4) === 'OggS') {
        fileExtension = 'ogg';
      } else if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
        fileExtension = 'wav';
      }

      console.log(`[SONG] 📄 Format détecté : ${fileExtension}`);

      // Conversion MP3 si nécessaire
      let finalBuffer    = audioBuffer;
      const finalMimetype = 'audio/mpeg';
      const finalExtension = 'mp3';

      if (fileExtension !== 'mp3') {
        console.log(`[SONG] 🔄 Conversion ${fileExtension} → mp3 via ffmpeg...`);
        try {
          finalBuffer = await withTimeout(toAudio(audioBuffer, fileExtension), 60000, 'conversion ffmpeg');
          if (!finalBuffer || finalBuffer.length === 0) {
            throw new Error('La conversion a retourné un buffer vide');
          }
          console.log(`[SONG] ✅ Conversion OK — ${finalBuffer.length} octets`);
        } catch (convErr) {
          console.error('[SONG] ❌ Conversion échouée:', convErr.message);
          throw new Error(`Conversion MP3 échouée : ${convErr.message}`);
        }
      }

      const fileName = ((audioData?.title || video.title || 'song') + '.mp3').replace(/[^\w\s\-\.]/g, '');
      console.log(`[SONG] 📤 Envoi audio WhatsApp : ${fileName}`);

      await sock.sendMessage(chatId, {
        audio: finalBuffer,
        mimetype: finalMimetype,
        fileName,
        ptt: false
      }, { quoted: msg });

      console.log('[SONG] ✅ Audio envoyé avec succès');

      // Nettoyage temp
      try {
        // [PHASE 2 — SUITE] Ne balaie plus que le dossier temp de LA session
        // courante — avant, ../../temp était partagé et pouvait supprimer un
        // fichier audio en cours d'utilisation par une autre session.
        const tempDir = tempManager.getTempDir();
        if (fs.existsSync(tempDir)) {
          const now = Date.now();
          fs.readdirSync(tempDir).forEach(file => {
            const fp = path.join(tempDir, file);
            try {
              const stats = fs.statSync(fp);
              if (now - stats.mtimeMs > 10000 && /\.(mp3|m4a|ogg|wav|opus)$/.test(file)) {
                fs.unlinkSync(fp);
              }
            } catch { /* ignore */ }
          });
        }
      } catch { /* ignore */ }

    } catch (err) {
      console.error('[SONG] 💥 Erreur fatale:', err.message || err);

      let errorMessage = `*❌ ${toSmallCaps("loracle a echoue a aspirer ce cantique")} !*`;

      if (err.message?.includes('bloqué') || err.message?.includes('blocked')) {
        errorMessage = `*❌ ${toSmallCaps("l aspiration est sous le coup d un scelle geographique")} !*`;
      } else if (err.message?.includes('451') || err.status === 451) {
        errorMessage = `*❌ ${toSmallCaps("arcane indisponible sous scelle legal ou regional")} !*`;
      } else if (err.message?.includes('Toutes les sources')) {
        errorMessage = `*❌ ${toSmallCaps("toutes les sources d invocation ont echoue")} !*`;
      } else if (err.message?.includes('TIMEOUT')) {
        errorMessage = `*❌ ${toSmallCaps("l invocation a expire — essaie un autre titre")} !*`;
      } else if (err.message?.includes('invalide')) {
        errorMessage = `*❌ ${toSmallCaps("lien invalide — utilise un lien youtube valide")} !*`;
      }

      await reply(`${errorMessage}\n\n${safeFooter(extra)}`).catch(() => {});
    }
  }
};
