// HOT_DEPLOY_MARKER: downloader-reliability-live-v3
/**
 * Facebook Downloader - 𝐃𝐚𝐫𝐤 Edition
 * APIs JSON fiables (pas de scraping HTML) :
 *  1. Social Downloader API (gratuite, JSON)
 *  2. API Cobalt (open source, self-hostable)
 *  3. RapidAPI social-media-video-downloader (nécessite clé)
 * Messages adaptés au style/persona actif via extra.phrases
 */

const axios  = require('axios');
const sessionContext = require('../../utils/sessionContext');
const config = require('../../config');

const processedMessages = new Set();

const MAX_VIDEO_BYTES = Number(process.env.FACEBOOK_VIDEO_MAX_BYTES || 45 * 1024 * 1024);
const RESOLVE_TIMEOUT_MS = Number(process.env.FACEBOOK_RESOLVE_TIMEOUT_MS || 60000);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.FACEBOOK_DOWNLOAD_TIMEOUT_MS || 90000);
const SEND_TIMEOUT_MS = Number(process.env.FACEBOOK_SEND_TIMEOUT_MS || 60000);

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

async function fetchFacebookVideo(url) {
  if (!url) throw new Error('URL vidéo Facebook absente.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  timer.unref?.();

  try {
    const res = await axios.get(url, {
      responseType: 'stream',
      timeout: Math.min(DOWNLOAD_TIMEOUT_MS, 45000),
      signal: controller.signal,
      maxRedirects: 6,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: status => status >= 200 && status < 400,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'video/*,application/octet-stream;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'identity',
        'Referer': 'https://www.facebook.com/',
      },
    });

    const declared = Number(res.headers?.['content-length'] || 0);
    if (declared && declared > MAX_VIDEO_BYTES) {
      try { res.data.destroy?.(); } catch (_) {}
      throw new Error(`Vidéo Facebook trop volumineuse (${Math.ceil(declared / 1024 / 1024)} Mo ; limite ${Math.ceil(MAX_VIDEO_BYTES / 1024 / 1024)} Mo)`);
    }

    const chunks = [];
    let bytes = 0;
    for await (const chunk of res.data) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_VIDEO_BYTES) {
        try { res.data.destroy?.(); } catch (_) {}
        throw new Error(`Vidéo Facebook trop volumineuse (limite ${Math.ceil(MAX_VIDEO_BYTES / 1024 / 1024)} Mo)`);
      }
      chunks.push(buffer);
    }

    if (bytes < 5000) throw new Error('La source Facebook a renvoyé une vidéo vide ou invalide.');

    return {
      buffer: Buffer.concat(chunks, bytes),
      contentType: String(res.headers?.['content-type'] || 'video/mp4').split(';')[0],
      bytes,
    };
  } catch (err) {
    if (controller.signal.aborted) throw new Error('Téléchargement Facebook expiré.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// ─────────────────────────────────────────────────────────────
// API 1 : Cobalt (instances multiples, v10+)
// ─────────────────────────────────────────────────────────────
async function tryCobalt(url) {
  const instances = [
    'https://api.cobalt.tools',
    'https://cobalt.drgns.space',
    'https://cobalt.api.timelessnesses.me',
  ];
  for (const base of instances) {
    try {
      const res = await axios.post(`${base}/`, {
        url, downloadMode: 'auto', videoQuality: '720',
        audioFormat: 'mp3', filenameStyle: 'pretty',
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; DarkBot/1.0)',
        },
        timeout: 15000,
      });
      const d = res.data;
      if (d?.status === 'tunnel' || d?.status === 'redirect' || d?.status === 'stream') {
        return { videoUrl: d.url, quality: 'ʜᴅ' };
      }
      if (d?.status === 'picker' && d?.picker?.length > 0) {
        const vid = d.picker.find(p => p.type === 'video') || d.picker[0];
        return { videoUrl: vid.url, quality: 'ʜᴅ' };
      }
    } catch (_) {}
  }
  throw new Error('cobalt: toutes les instances ont échoué');
}

// ─────────────────────────────────────────────────────────────
// API 2 : SnapSave (API JSON fiable pour Facebook)
// ─────────────────────────────────────────────────────────────
async function trySnapSave(url) {
  const res = await axios.post('https://snapsave.app/action.php', 
    `url=${encodeURIComponent(url)}&lang=fr&plat=facebook`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F)',
        'Referer': 'https://snapsave.app/',
        'Origin': 'https://snapsave.app',
        'Accept': '*/*',
      },
      timeout: 15000,
    }
  );
  const data = res.data;
  // SnapSave retourne du JSON ou du HTML selon la version
  if (typeof data === 'object' && data?.url) {
    return { videoUrl: data.url, quality: 'ʜᴅ' };
  }
  if (typeof data === 'object' && Array.isArray(data)) {
    const hd = data.find(v => v.quality?.includes('HD')) || data[0];
    if (hd?.url) return { videoUrl: hd.url, quality: 'ʜᴅ' };
  }
  throw new Error('snapsave: format de réponse inattendu');
}

// ─────────────────────────────────────────────────────────────
// API 3 : SaveFrom (JSON endpoint)
// ─────────────────────────────────────────────────────────────
async function trySavefrom(url) {
  const sfUrl = `https://savefrom.net/api/convert?url=${encodeURIComponent(url)}&lang=fr`;
  const res = await axios.get(sfUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
      'Referer': 'https://savefrom.net/',
    },
    timeout: 12000,
  });
  const d = res.data;
  if (!d) throw new Error('savefrom: pas de données');
  const hd = d?.url?.find?.(v => v.id?.includes('720') || v.id?.includes('480')) || d?.url?.[0];
  if (!hd?.url) throw new Error('savefrom: URL introuvable');
  return { videoUrl: hd.url, quality: hd.id?.includes('720') ? 'ʜᴅ' : 'sᴅ' };
}

// ─────────────────────────────────────────────────────────────
// API 4 : fdown.net (spécialisé Facebook)
// ─────────────────────────────────────────────────────────────
async function tryFdown(url) {
  const res = await axios.post('https://fdown.net/download.php',
    `URLz=${encodeURIComponent(url)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
        'Referer': 'https://fdown.net/',
        'Origin': 'https://fdown.net',
      },
      timeout: 12000,
    }
  );
  const html = res.data || '';
  // Chercher l'URL HD dans la réponse HTML
  const hdMatch = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i)
    || html.match(/sd_link['":\s]+"(https?:\/\/[^"]+)"/i);
  if (hdMatch?.[1]) return { videoUrl: hdMatch[1].replace(/&amp;/g, '&'), quality: 'ʜᴅ' };
  throw new Error('fdown: URL introuvable dans la réponse');
}

// ─────────────────────────────────────────────────────────────
// Cascade : essai des 4 APIs dans l'ordre
// ─────────────────────────────────────────────────────────────
async function downloadFacebook(url) {
  const apis = [
    { name: 'cobalt',    fn: () => tryCobalt(url)    },
    { name: 'snapsave',  fn: () => trySnapSave(url)  },
    { name: 'fdown',     fn: () => tryFdown(url)     },
    { name: 'savefrom',  fn: () => trySavefrom(url)  },
  ];
  const errors = [];
  for (const api of apis) {
    try {
      const result = await api.fn();
      result.apiUsed = api.name;
      console.log(`[facebook] Succès via ${api.name}`);
      return result;
    } catch (e) {
      errors.push(`[${api.name}] ${e.message}`);
      console.warn(`[facebook] ${api.name} échoué:`, e.message);
    }
  }
  throw new Error(errors.join(' | '));
}

// ─────────────────────────────────────────────────────────────
// Patterns URLs Facebook valides
// ─────────────────────────────────────────────────────────────
const FB_PATTERNS = [
  /https?:\/\/(?:www\.|m\.)?facebook\.com\//,
  /https?:\/\/(?:www\.|m\.)?fb\.com\//,
  /https?:\/\/fb\.watch\//,
  /https?:\/\/(?:www\.)?facebook\.com\/watch/,
  /https?:\/\/(?:www\.)?facebook\.com\/.*\/videos\//,
  /https?:\/\/(?:www\.)?facebook\.com\/reel\//,
  /https?:\/\/(?:www\.)?facebook\.com\/share\/v\//,
];

// ─────────────────────────────────────────────────────────────
// MODULE EXPORT
// ─────────────────────────────────────────────────────────────
module.exports = {
  name   : 'facebook',
  aliases: ['illusions_facebook', 'fb', 'fbdl', 'facebookdl', 'illusion_facebook'],
  category: '📥 Téléchargements',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀsᴘɪʀᴇ ᴇᴛ ᴛᴇ́ʟᴇ́ᴄʜᴀʀɢᴇ ᴅᴇs ᴠɪᴅᴇ́ᴏs Facebook',
  usage: `${config.prefix || '.'}facebook [lien facebook]`,
  groupOnly     : false,
  adminOnly     : false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, phrases, from } = extra;

    try {
      if (processedMessages.has(sessionContext.scopeKey(msg.key.id))) return;
      processedMessages.add(sessionContext.scopeKey(msg.key.id));
      setTimeout(() => processedMessages.delete(sessionContext.scopeKey(msg.key.id)), 5 * 60 * 1000);

      const url = (args[0] || '').trim();

      // ── Aucun lien ────────────────────────────────────────
      if (!url) {
        return reply(
          `╭╼≪• *🌑 ʟ'ᴏᴍʙʀᴇ ʀᴇᴊᴇᴛᴛᴇ ᴄᴇᴛ ᴀᴘᴘᴇʟ* •≫╾╮\n` +
          `┃\n` +
          `┃ 🔮 *${toSC('indique un lien facebook')}*\n` +
          `┃ ᴇx : \`${config.prefix || '.'}facebook https://fb.watch/...\`\n` +
          `┃\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n` +
          phrases.footer()
        );
      }

      // ── Validation URL ────────────────────────────────────
      if (!FB_PATTERNS.some(p => p.test(url))) {
        return reply(
          `*❌ ${toSC('ce lien nest pas un lien facebook valide')} !*\n\n${phrases.footer()}`
        );
      }

      // ── Réaction chargement ───────────────────────────────
      try { await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }); } catch (_) {}

      // ── Téléchargement ────────────────────────────────────
      let videoData;
      try {
        videoData = await withTimeout(downloadFacebook(url), RESOLVE_TIMEOUT_MS, 'Résolution Facebook');
      } catch (dlErr) {
        try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch (_) {}
        return reply(
          `╭╼≪• *❌ ᴇᴄʜᴇᴄ ᴅᴇ ʟɪʟʟᴜsɪᴏɴ* •≫╾╮\n` +
          `┃\n` +
          `┃ 🥀 *${toSC('loracle a echoue a aspirer la video')}*\n` +
          `┃ ⚠️ *${toSC('erreur')} :* ${dlErr.message.slice(0, 120)}\n` +
          `┃\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n` +
          phrases.footer()
        );
      }

      // ── Caption selon style actif ─────────────────────────
      const botName  = toSC(config.botName || 'Dark');
      const srcCourt = url.length > 35 ? url.slice(0, 32) + '…' : url;

      const caption =
        `╭╼≪• *🎬 ᴀsᴘɪʀᴀᴛɪᴏɴ ʀᴇ́ᴜssɪᴇ* •≫╾╮\n` +
        `┃\n` +
        `┃ 🔮 *${toSC('extrait par')} :* ${botName}\n` +
        `┃ 🔗 *${toSC('source')} :* ${srcCourt}\n` +
        `┃ 📹 *${toSC('qualite')} :* ${videoData.quality}\n` +
        `┃ ⚙️ *${toSC('via')} :* ${videoData.apiUsed}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n` +
        phrases.footer();

      // ── Téléchargement serveur puis envoi WhatsApp borné ───
      // Ne jamais laisser Baileys télécharger lui-même une URL distante :
      // si le CDN Facebook ralentit, sendMessage peut rester bloqué sans fin.
      const media = await withTimeout(
        fetchFacebookVideo(videoData.videoUrl),
        DOWNLOAD_TIMEOUT_MS + 5000,
        'Téléchargement Facebook'
      );

      await withTimeout(
        sock.sendMessage(from, {
          video: media.buffer,
          mimetype: media.contentType.startsWith('video/') ? media.contentType : 'video/mp4',
          fileName: 'NexAI-Facebook.mp4',
          caption,
        }, { quoted: msg }),
        SEND_TIMEOUT_MS,
        'Envoi WhatsApp Facebook'
      );

      try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }); } catch (_) {}

    } catch (err) {
      console.error('[facebook] erreur générale:', err.message);
      try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch (_) {}
      await reply(
        `*❌ ${toSC('le telechargement facebook a echoue')}*\n${String(err?.message || err).slice(0, 300)}\n\n${phrases.footer()}`
      );
    }
  }
};
