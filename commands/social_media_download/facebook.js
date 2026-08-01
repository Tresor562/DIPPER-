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
        videoData = await downloadFacebook(url);
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

      // ── Envoi — URL directe puis fallback buffer ──────────
      try {
        await sock.sendMessage(from, {
          video   : { url: videoData.videoUrl },
          mimetype: 'video/mp4',
          caption,
        }, { quoted: msg });

        try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }); } catch (_) {}

      } catch (_) {
        // Fallback buffer
        const vRes = await axios.get(videoData.videoUrl, {
          responseType: 'arraybuffer',
          timeout: 90000,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://facebook.com' },
        });
        await sock.sendMessage(from, {
          video   : Buffer.from(vRes.data),
          mimetype: 'video/mp4',
          caption,
        }, { quoted: msg });

        try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }); } catch (_) {}
      }

    } catch (err) {
      console.error('[facebook] erreur générale:', err.message);
      try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch (_) {}
      await reply(
        `*❌ ${toSC('une singularite est survenue')}...*\n\n${phrases.footer()}`
      );
    }
  }
};
