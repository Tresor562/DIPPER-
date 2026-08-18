'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const config = require('../../config');
const { sendMediaCarousel } = require('../../utils/interactiveCarousel');

const API = 'https://api.nexray.web.id';
const UA = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const MAX_VIDEO_RESULTS = 4;

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
    if (Array.isArray(value)) {
      const found = value.find(v => typeof v === 'string' && /^https?:\/\//i.test(v));
      if (found) return found;
    }
  }
  return '';
}

function extractArray(data) {
  for (const c of [data, data?.result, data?.results, data?.data, data?.data?.result, data?.data?.results, data?.result?.data, data?.result?.results]) {
    if (Array.isArray(c)) return c;
  }
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) if (Array.isArray(v)) return v;
  }
  return [];
}

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function relevance(query, text) {
  const q = normalizeText(query);
  const t = normalizeText(text);
  if (!q || !t) return 0;
  if (t.includes(q)) return 100;
  const tokens = [...new Set(q.split(/\s+/).filter(x => x.length > 1))];
  if (!tokens.length) return 0;
  const hits = tokens.filter(x => t.includes(x)).length;
  return Math.round((hits / tokens.length) * 80);
}

function rankExact(query, items, textOf) {
  return items
    .map((item, index) => ({ item, index, score: relevance(query, textOf(item)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((x, i) => x.score >= 40 || i < 2)
    .map(x => x.item);
}

function decodeHtml(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function nexray(endpoint, query) {
  const r = await axios.get(`${API}${endpoint}`, {
    params: { q: query },
    timeout: 16000,
    headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' },
  });
  return extractArray(r.data);
}

async function bingImages(query) {
  const r = await axios.get('https://www.bing.com/images/search', {
    params: { q: query, form: 'HDRSC3' }, timeout: 18000,
    headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
  });
  const html = String(r.data || '');
  const out = [];
  const re = /<a[^>]+class=["'][^"']*iusc[^"']*["'][^>]+m=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 20) {
    try {
      const j = JSON.parse(decodeHtml(m[1]));
      const image = firstString(j.murl, j.turl);
      if (!image) continue;
      out.push({ image, thumbnail: j.turl, url: firstString(j.purl, j.murl), title: decodeHtml(j.tit || j.desc || `Résultat ${out.length + 1}`) });
    } catch (_) {}
  }
  return out;
}

async function searchPinterest(query) {
  let raw = [];
  try { raw = await nexray('/search/pinterest', query); } catch (_) {}
  const normalized = raw.map((item, i) => {
    if (typeof item === 'string') return { type: 'image', mediaUrl: item, title: query, url: item };
    const mediaUrl = firstString(item?.image, item?.image_url, item?.imageUrl, item?.thumbnail, item?.thumb, item?.cover, item?.images, item?.src, item?.photo);
    if (!mediaUrl) return null;
    return {
      type: 'image', mediaUrl,
      title: String(item?.title || item?.description || item?.caption || query).slice(0, 140),
      body: String(item?.author?.name || item?.username || '').slice(0, 100),
      url: firstString(item?.url, item?.link, item?.source, mediaUrl),
    };
  }).filter(Boolean);
  if (normalized.length) return rankExact(query, normalized, x => `${x.title} ${x.body}`).slice(0, 10);

  const fallback = await bingImages(`site:pinterest.com ${query}`);
  return rankExact(query, fallback, x => x.title).slice(0, 10).map(x => ({ type: 'image', mediaUrl: x.image, title: x.title || query, url: x.url || x.image }));
}

async function youtubeDirectVideo(url) {
  const info = await ytdl.getInfo(url);
  const candidates = info.formats
    .filter(f => f.hasVideo && f.hasAudio && /^https?:\/\//.test(f.url || ''))
    .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0));
  const preferred = candidates.find(f => (f.height || 0) <= 720) || candidates[0];
  if (!preferred?.url) throw new Error('Flux vidéo YouTube indisponible');
  return preferred.url;
}

async function searchYouTube(query) {
  const result = await yts(query);
  const ranked = rankExact(query, result?.videos || [], v => `${v.title || ''} ${v.author?.name || ''}`).slice(0, MAX_VIDEO_RESULTS);
  const items = [];
  for (const v of ranked) {
    try {
      const direct = await youtubeDirectVideo(v.url);
      items.push({ type: 'video', mediaUrl: direct, title: v.title, body: `👤 ${v.author?.name || 'YouTube'} • ⏱️ ${v.timestamp || ''}`, url: v.url });
    } catch (e) {
      console.warn('[youtubesearch] flux ignoré:', v.url, e.message);
    }
  }
  return items;
}

function normalizeTikTok(item, i, query) {
  if (!item || typeof item !== 'object') return null;
  const direct = firstString(item?.play, item?.play_url, item?.playUrl, item?.video, item?.video_url, item?.videoUrl, item?.nowm, item?.no_watermark, item?.download);
  if (!direct) return null;
  const title = String(item?.title || item?.desc || item?.description || item?.caption || query || `TikTok ${i + 1}`).slice(0, 150);
  const author = String(item?.author?.nickname || item?.author?.name || item?.username || '').trim();
  return { type: 'video', mediaUrl: direct, title, body: author ? `👤 ${author}` : '', url: firstString(item?.url, item?.share_url, item?.link, direct) };
}

async function searchTikTok(query) {
  const raw = await nexray('/search/tiktok', query);
  const items = raw.map((x, i) => normalizeTikTok(x, i, query)).filter(Boolean);
  return rankExact(query, items, x => `${x.title} ${x.body}`).slice(0, MAX_VIDEO_RESULTS);
}

function cleanFacebookUrl(raw) {
  try {
    const u = new URL(raw);
    if (!/(^|\.)facebook\.com$|(^|\.)fb\.watch$/i.test(u.hostname)) return '';
    u.searchParams.delete('utm_source'); u.searchParams.delete('utm_medium');
    return u.toString();
  } catch (_) { return ''; }
}

async function searchFacebookPages(query) {
  const r = await axios.get('https://www.bing.com/search', {
    params: { q: `site:facebook.com (reel OR videos OR watch) ${query}`, count: 12 },
    timeout: 18000,
    headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
  });
  const $ = cheerio.load(String(r.data || ''));
  const out = [];
  $('li.b_algo').each((_, el) => {
    const a = $(el).find('h2 a').first();
    const url = cleanFacebookUrl(a.attr('href') || '');
    if (!url) return;
    const title = a.text().trim();
    const snippet = $(el).find('.b_caption p').first().text().trim();
    out.push({ url, title, snippet });
  });
  return rankExact(query, out, x => `${x.title} ${x.snippet}`).slice(0, 8);
}

async function cobaltFacebook(url) {
  const instances = ['https://api.cobalt.tools', 'https://cobalt.drgns.space', 'https://cobalt.api.timelessnesses.me'];
  for (const base of instances) {
    try {
      const res = await axios.post(`${base}/`, { url, downloadMode: 'auto', videoQuality: '720', filenameStyle: 'pretty' }, {
        timeout: 16000,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
      });
      const d = res.data;
      if (['tunnel', 'redirect', 'stream'].includes(d?.status) && firstString(d?.url)) return d.url;
      if (d?.status === 'picker' && Array.isArray(d?.picker)) {
        const v = d.picker.find(x => x?.type === 'video' && firstString(x?.url));
        if (v?.url) return v.url;
      }
    } catch (_) {}
  }
  return '';
}

async function searchFacebook(query) {
  // Certaines révisions de Nexray exposent déjà une recherche Facebook vidéo.
  // Elle est prioritaire; le moteur web ne sert que de découverte de pages.
  let raw = [];
  try { raw = await nexray('/search/facebook', query); } catch (_) {}
  const direct = raw.map((x, i) => normalizeTikTok(x, i, query)).filter(Boolean);
  if (direct.length) return rankExact(query, direct, x => `${x.title} ${x.body}`).slice(0, MAX_VIDEO_RESULTS);

  const pages = await searchFacebookPages(query);
  const items = [];
  for (const p of pages) {
    if (items.length >= MAX_VIDEO_RESULTS) break;
    const mediaUrl = await cobaltFacebook(p.url);
    if (!mediaUrl) continue;
    items.push({ type: 'video', mediaUrl, title: p.title || query, body: p.snippet || 'Facebook', url: p.url });
  }
  return items;
}

async function genericSearch(endpoint, query, label) {
  let raw = [];
  try { raw = await nexray(endpoint, query); } catch (_) {}
  const items = raw.map((item, index) => {
    if (typeof item === 'string') return { type: 'image', mediaUrl: item, title: `${label} ${index + 1}`, url: item };
    const image = firstString(item?.image, item?.image_url, item?.thumbnail, item?.thumb, item?.cover, item?.images, item?.src);
    if (!image) return null;
    return { type: 'image', mediaUrl: image, title: String(item?.title || item?.name || item?.description || query).slice(0, 140), body: String(item?.author?.name || item?.username || '').slice(0, 100), url: firstString(item?.url, item?.link, image) };
  }).filter(Boolean);
  if (items.length) return rankExact(query, items, x => `${x.title} ${x.body}`).slice(0, 10);
  const fallback = await bingImages(`${label} ${query}`);
  return fallback.slice(0, 10).map(x => ({ type: 'image', mediaUrl: x.image, title: x.title || query, url: x.url || x.image }));
}

function command(name, aliases, label, searchFn) {
  return {
    name, aliases, category: '📥 Téléchargements',
    description: `Recherche ${label} avec résultats média réels.`,
    usage: `${config.prefix || '.'}${name} <recherche>`,
    async execute(sock, msg, args, extra) {
      const query = args.join(' ').trim();
      if (!query) return extra.reply(`🔎 Usage : ${config.prefix || '.'}${name} <ce que tu cherches>`);
      let wait = null;
      try {
        wait = await sock.sendMessage(extra.from, { text: `🔎 Recherche ${label} : *${query}*…` }, extra.from?.endsWith('@g.us') ? { quoted: msg } : undefined);
        const items = await searchFn(query);
        if (!items?.length) throw new Error('Aucun résultat média exact et exploitable trouvé.');
        try { if (wait?.key) await sock.sendMessage(extra.from, { delete: wait.key }); } catch (_) {}
        return sendMediaCarousel(sock, extra.from, {
          title: `🔎 ${label} — ${query}`,
          subtitle: `${items.length} résultat(s) • glisse vers la gauche`,
          items,
          quoted: extra.from?.endsWith('@g.us') ? msg : null,
        });
      } catch (error) {
        try { if (wait?.key) await sock.sendMessage(extra.from, { delete: wait.key }); } catch (_) {}
        console.error(`[${name}]`, error.message);
        return extra.reply(`❌ Recherche ${label} impossible : ${String(error?.message || error).slice(0, 180)}`);
      }
    },
  };
}

module.exports = [
  command('pinterest2', ['pinterestsearch', 'pinsearch'], 'Pinterest', searchPinterest),
  command('tiktoksearch', ['tiktok2', 'ttsearch'], 'TikTok', searchTikTok),
  command('youtubesearch', ['ytsearch2', 'youtube2'], 'YouTube', searchYouTube),
  command('facebooksearch', ['fbsearch'], 'Facebook', searchFacebook),
  command('soundcloudsearch', ['scsearch'], 'SoundCloud', q => genericSearch('/search/soundcloud', q, 'SoundCloud')),
  command('spotifysearch', ['spsearch'], 'Spotify', q => genericSearch('/search/spotify', q, 'Spotify')),
  command('bilibilisearch', ['bbsearch'], 'Bilibili', q => genericSearch('/search/bilibili', q, 'Bilibili')),
  command('instagramsearch', ['igsearch'], 'Instagram', q => genericSearch('/search/googleimage', `site:instagram.com ${q}`, 'Instagram')),
  command('xsearch', ['twittersearch'], 'X / Twitter', q => genericSearch('/search/googleimage', `site:x.com ${q}`, 'X')),
];
