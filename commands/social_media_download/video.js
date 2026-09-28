// HOT_DEPLOY_MARKER: downloader-reliability-live-v3
'use strict';

/**
 * NexAI / THE BIG DIPPER — YouTube video downloader.
 * The old flow could stay silent for minutes because three remote APIs were
 * retried serially and Baileys was then asked to fetch the remote URL itself.
 *
 * This version:
 *  - tries a local @distube/ytdl-core progressive MP4 first;
 *  - uses short, bounded API fallbacks;
 *  - downloads the returned media URL to a verified Buffer before WhatsApp;
 *  - applies hard timeouts and a size cap;
 *  - always reports a terminal success/failure state.
 */

const axios = require('axios');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const APIs = require('../../utils/api');
const config = require('../../config');

const MAX_VIDEO_BYTES = Number(process.env.VIDEO_MAX_BYTES || 45 * 1024 * 1024);
const STEP_TIMEOUT_MS = Number(process.env.VIDEO_STEP_TIMEOUT_MS || 25000);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.VIDEO_DOWNLOAD_TIMEOUT_MS || 90000);
const SEND_TIMEOUT_MS = Number(process.env.VIDEO_SEND_TIMEOUT_MS || 60000);

function toSmallCaps(text) {
  const normal = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const smallCaps = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => {
      const i = normal.indexOf(c);
      return i !== -1 ? smallCaps[i] : c;
    }).join('');
}

function safeFooter(extra) {
  try { return extra?.phrases?.footer?.() || ''; } catch (_) { return ''; }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return 'youtube.com'; }
}

function isYouTubeUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'youtu.be' || h === 'youtube.com' || h.endsWith('.youtube.com');
  } catch (_) {
    return false;
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} expiré après ${Math.ceil(ms / 1000)} s`)), ms);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

async function streamToBuffer(stream, maxBytes = MAX_VIDEO_BYTES, timeoutMs = DOWNLOAD_TIMEOUT_MS) {
  const chunks = [];
  let bytes = 0;
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { stream.destroy?.(); } catch (_) {}
        reject(new Error(`Téléchargement vidéo expiré après ${Math.ceil(timeoutMs / 1000)} s`));
      }, timeoutMs);
      timer.unref?.();
    });

    const consume = (async () => {
      for await (const chunk of stream) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += b.length;
        if (bytes > maxBytes) {
          try { stream.destroy?.(); } catch (_) {}
          throw new Error(`Vidéo trop volumineuse (limite ${Math.ceil(maxBytes / 1024 / 1024)} Mo)`);
        }
        chunks.push(b);
      }
      if (!bytes) throw new Error('La source a renvoyé une vidéo vide.');
      return Buffer.concat(chunks, bytes);
    })();

    return await Promise.race([consume, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchVideoBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: Math.min(DOWNLOAD_TIMEOUT_MS, 45000),
      signal: controller.signal,
      maxRedirects: 6,
      validateStatus: s => s >= 200 && s < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'video/*,application/octet-stream;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'identity',
      },
    });

    const declared = Number(response.headers?.['content-length'] || 0);
    if (declared && declared > MAX_VIDEO_BYTES) {
      try { response.data.destroy?.(); } catch (_) {}
      throw new Error(`Vidéo trop volumineuse (${Math.ceil(declared / 1024 / 1024)} Mo ; limite ${Math.ceil(MAX_VIDEO_BYTES / 1024 / 1024)} Mo)`);
    }

    return await streamToBuffer(response.data);
  } catch (e) {
    if (controller.signal.aborted) throw new Error('Téléchargement vidéo expiré.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadWithYtdl(url) {
  const info = await withTimeout(ytdl.getInfo(url), STEP_TIMEOUT_MS, 'Analyse YouTube');
  const formats = (info.formats || [])
    .filter(f => f.hasAudio && f.hasVideo && f.container === 'mp4')
    .sort((a, b) => {
      const ah = Number(a.height || 0), bh = Number(b.height || 0);
      const aSize = Number(a.contentLength || 0), bSize = Number(b.contentLength || 0);
      const aFits = !aSize || aSize <= MAX_VIDEO_BYTES;
      const bFits = !bSize || bSize <= MAX_VIDEO_BYTES;
      if (aFits !== bFits) return aFits ? -1 : 1;
      const aTarget = ah <= 720 ? ah : -ah;
      const bTarget = bh <= 720 ? bh : -bh;
      return bTarget - aTarget;
    });

  const format = formats.find(f => {
    const size = Number(f.contentLength || 0);
    return !size || size <= MAX_VIDEO_BYTES;
  });
  if (!format) throw new Error('Aucun format MP4 progressif compatible avec la limite de taille.');

  const stream = ytdl.downloadFromInfo(info, {
    format,
    highWaterMark: 1 << 25,
  });
  const buffer = await streamToBuffer(stream);
  return {
    buffer,
    title: info.videoDetails?.title || 'Video',
    source: 'ytdl-local',
  };
}

async function downloadWithApis(url) {
  const sources = [
    ['EliteProTech', () => APIs.getEliteProTechVideoByUrl(url)],
    ['Yupra', () => APIs.getYupraVideoByUrl(url)],
    ['Okatsu', () => APIs.getOkatsuVideoByUrl(url)],
  ];
  const errors = [];

  for (const [name, fn] of sources) {
    try {
      const data = await withTimeout(fn(), STEP_TIMEOUT_MS, `API ${name}`);
      const mediaUrl = data?.download || data?.dl || data?.url;
      if (!mediaUrl) throw new Error('aucune URL média');
      const buffer = await fetchVideoBuffer(mediaUrl);
      return {
        buffer,
        title: data?.title || 'Video',
        source: name,
      };
    } catch (e) {
      errors.push(`${name}: ${e?.message || e}`);
      console.warn('[VIDEO]', name, 'échec:', e?.message || e);
    }
  }

  throw new Error(errors.join(' | ') || 'Aucune source vidéo disponible.');
}

module.exports = {
  name: 'video',
  aliases: ['illusions_youtube', 'ytvideo', 'ytv', 'ytmp4', 'ytvid', 'illusion_youtube', 'dlyoutube'],
  category: '📥 Téléchargements',
  description: 'Télécharge une vidéo YouTube de façon fiable.',
  usage: `${config.prefix || '.'}video [nom ou lien youtube]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const chatId = msg.key.remoteJid;
    const reply = async text => sock.sendMessage(chatId, { text }, { quoted: msg });

    try {
      const query = String(args?.join(' ') || '').trim();
      if (!query) {
        return reply(
          `*⚠️ ${toSmallCaps('indique un nom ou un lien youtube')}*\n\n` +
          `${safeFooter(extra)}`
        );
      }

      let videoUrl;
      let videoTitle = '';
      let thumbnail = '';

      if (/^https?:\/\//i.test(query)) {
        if (!isYouTubeUrl(query)) {
          return reply(`*❌ ${toSmallCaps('ce lien nest pas un lien youtube valide')}*\n\n${safeFooter(extra)}`);
        }
        videoUrl = query;
      } else {
        const result = await withTimeout(yts(query), 15000, 'Recherche YouTube');
        const first = result?.videos?.[0];
        if (!first?.url) {
          return reply(`*❌ ${toSmallCaps('aucune video trouvee')}*\n\n${safeFooter(extra)}`);
        }
        videoUrl = first.url;
        videoTitle = first.title || '';
        thumbnail = first.thumbnail || '';
      }

      const botName = toSmallCaps(config.botName || 'NexAI');
      const sourceDomain = getDomain(videoUrl);

      try {
        const ytId = (videoUrl.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/)([a-zA-Z0-9_-]{11})/) || [])[1];
        const thumb = thumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null);
        if (thumb) {
          await withTimeout(sock.sendMessage(chatId, {
            image: { url: thumb },
            caption:
              `*🎬 ${toSmallCaps('telechargement en cours')}*\n` +
              `🔗 ${sourceDomain}\n` +
              (videoTitle ? `🔖 ${videoTitle}\n` : '') +
              `\n${safeFooter(extra)}`
          }, { quoted: msg }), 20000, 'Envoi de la miniature');
        }
      } catch (e) {
        console.warn('[VIDEO] miniature ignorée:', e?.message || e);
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } }).catch(() => {});

      let media;
      try {
        media = await downloadWithYtdl(videoUrl);
      } catch (localErr) {
        console.warn('[VIDEO] ytdl local échoué:', localErr?.message || localErr);
        media = await downloadWithApis(videoUrl);
      }

      const title = media.title || videoTitle || 'Video';
      await withTimeout(sock.sendMessage(chatId, {
        video: media.buffer,
        mimetype: 'video/mp4',
        fileName: `${String(title).replace(/[^\w\s.-]/g, '').slice(0, 90) || 'video'}.mp4`,
        caption:
          `*🎬 ${toSmallCaps('telechargement termine')}*\n` +
          `🔮 ${botName}\n` +
          `🔗 ${sourceDomain}\n` +
          `🔖 ${title}\n` +
          `⚙️ ${media.source}\n\n` +
          safeFooter(extra)
      }, { quoted: msg }), SEND_TIMEOUT_MS, 'Envoi WhatsApp');

      await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (error) {
      console.error('[VIDEO] erreur:', error?.stack || error?.message || error);
      await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(
        `*❌ ${toSmallCaps('le telechargement video a echoue')}*\n` +
        `${String(error?.message || 'Erreur inconnue').slice(0, 350)}\n\n` +
        safeFooter(extra)
      ).catch(() => {});
    }
  }
};
