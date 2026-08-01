/**
 * IMDB + YTS Commands — 𝐃𝐚𝐫𝐤 Edition
 * ─────────────────────────────────────────────
 * .imdb → recherche films/séries (OMDB API gratuit)
 * .yts  → recherche YouTube (YouTube Data v3 JSON)
 *
 * APIs : omdbapi.com (clé gratuite) + YouTube search via scraping JSON
 */

const axios  = require('axios');
const sessionContext = require('../../utils/sessionContext');
const config = require('../../config.js');

const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

const PFX = config.prefix || '.';
const CAT = '🔍 Recherche';
const cooldowns = new Map();
function checkCD(cmd, jid, secs=10) {
  const key = sessionContext.scopeKey(`${cmd}:${jid}`), now=Date.now(), last=cooldowns.get(key)||0;
  if (now-last < secs*1000) return { blocked:true, remaining:Math.ceil((secs*1000-(now-last))/1000) };
  cooldowns.set(key, now); return { blocked:false, remaining:0 };
}

// ─────────────────────────────────────────────────────────────
// IMDB via OMDB API (clé gratuite : theomdbapi.com)
// Fallback : RapidAPI IMDB wrapper (JSON public endpoint)
// ─────────────────────────────────────────────────────────────
async function searchIMDB(query) {
  // Tentative 1 : OMDB API avec clé démo (limitée mais fonctionnelle)
  try {
    const res = await axios.get('https://www.omdbapi.com/', {
      params: { apikey: 'trilogy', t: query, plot: 'short' },
      timeout: 10000,
    });
    const d = res.data;
    if (d.Response === 'True') return d;
    // Essai recherche par liste
    const res2 = await axios.get('https://www.omdbapi.com/', {
      params: { apikey: 'trilogy', s: query, type: 'movie' },
      timeout: 10000,
    });
    if (res2.data?.Search?.length) {
      // Récupérer les détails du premier résultat
      const r3 = await axios.get('https://www.omdbapi.com/', {
        params: { apikey: 'trilogy', i: res2.data.Search[0].imdbID, plot: 'short' },
        timeout: 10000,
      });
      if (r3.data?.Response === 'True') return r3.data;
    }
  } catch (_) {}

  // Tentative 2 : API alternative (imdb-api.com endpoint public)
  try {
    const res = await axios.get(
      `https://imdb-api.com/en/API/SearchMovie/k_12345678/${encodeURIComponent(query)}`,
      { timeout: 10000 }
    );
    const item = res.data?.results?.[0];
    if (item) return {
      Title      : item.title,
      Year       : item.description,
      Type       : 'movie',
      Poster     : item.image,
      imdbID     : item.id,
      Plot       : 'Disponible sur IMDB',
      imdbRating : 'N/A',
      Genre      : 'N/A',
      Director   : 'N/A',
      Runtime    : 'N/A',
    };
  } catch (_) {}

  throw new Error('Film/série introuvable');
}

// ─────────────────────────────────────────────────────────────
// YouTube Search via scraping JSON (sans clé API)
// ─────────────────────────────────────────────────────────────
async function searchYouTube(query) {
  // Utilise l'endpoint invidious (instance YT sans JS)
  const instances = [
    'https://invidious.privacyredirect.com',
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
  ];

  for (const base of instances) {
    try {
      const res = await axios.get(`${base}/api/v1/search`, {
        params: { q: query, type: 'video', fields: 'title,videoId,author,lengthSeconds,viewCount' },
        timeout: 10000,
      });
      const items = res.data?.slice(0, 5) || [];
      if (items.length > 0) return items.map(v => ({
        title    : v.title,
        videoId  : v.videoId,
        author   : v.author,
        duration : v.lengthSeconds ? `${Math.floor(v.lengthSeconds/60)}:${String(v.lengthSeconds%60).padStart(2,'0')}` : 'N/A',
        views    : v.viewCount?.toLocaleString() || 'N/A',
        url      : `https://youtu.be/${v.videoId}`,
      }));
    } catch (_) {}
  }

  // Dernier fallback : YouTube search page scraping simplifié
  const res = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr-FR' },
    timeout: 12000,
  });
  const ids = [...res.data.matchAll(/"videoId":"([^"]{11})"/g)].map(m => m[1]);
  const titles = [...res.data.matchAll(/"title":{"runs":\[{"text":"([^"]+)"/g)].map(m => m[1]);
  const channels = [...res.data.matchAll(/"ownerText":{"runs":\[{"text":"([^"]+)"/g)].map(m => m[1]);

  if (!ids.length) throw new Error('Aucune vidéo trouvée');
  return ids.slice(0,5).map((id, i) => ({
    title  : titles[i] || 'Titre inconnu',
    videoId: id,
    author : channels[i] || 'Chaîne inconnue',
    url    : `https://youtu.be/${id}`,
  }));
}

// ─────────────────────────────────────────────────────────────

module.exports = [

  // ── .imdb ────────────────────────────────────────────────
  {
    name: 'imdb', aliases: ['film', 'serie', 'movie', 'cinema', 'cine'],
    category: CAT,
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴄʜᴇʀᴄʜᴇ ꜰɪʟᴍs/sᴇ́ʀɪᴇs IMDB 🎬',
    usage: `${PFX}imdb <titre>`,
    async execute(sock, msg, args, extra) {
      const { reply, from, sender, phrases } = extra;
      const { blocked, remaining } = checkCD('imdb', sender);
      if (blocked) return reply(`*⏳ ${SC('cooldown')} : ${remaining}s*\n\n${phrases.footer()}`);
      if (!args.length) return reply(`*📌 ${SC('usage')} :* \`${PFX}imdb <titre>\`\n\n${phrases.footer()}`);

      const query = args.join(' ');
      await sock.sendMessage(from, { react: { text: '🎬', key: msg.key } }).catch(()=>{});

      try {
        const d = await searchIMDB(query);
        const caption =
          `╭╼≪• *🎬 IMDB* •≫╾╮\n` +
          `┃\n` +
          `┃ 🎞️ *${d.Title}* (${d.Year})\n` +
          `┃ 📂 *${SC('type')}* : ${d.Type}\n` +
          `┃ 🎭 *${SC('genre')}* : ${d.Genre}\n` +
          `┃ 🎬 *${SC('réalisateur')}* : ${d.Director}\n` +
          `┃ ⏱️ *${SC('durée')}* : ${d.Runtime}\n` +
          `┃ ⭐ *${SC('note imdb')}* : ${d.imdbRating}/10\n` +
          `┃\n` +
          `┃ 📝 *${SC('synopsis')} :*\n` +
          `┃ _${(d.Plot||'').slice(0,250)}_\n` +
          (d.imdbID ? `┃\n┃ 🔗 https://imdb.com/title/${d.imdbID}\n` : '') +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;

        if (d.Poster && d.Poster !== 'N/A') {
          await sock.sendMessage(from, { image: { url: d.Poster }, caption }, { quoted: msg });
        } else {
          await reply(caption);
        }
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
      } catch (err) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
        await reply(`*❌ ${SC('introuvable')} : "${query}"*\n_${err.message}_\n\n${phrases.footer()}`);
      }
    }
  },

  // ── .yts ─────────────────────────────────────────────────
  {
    name: 'yts', aliases: ['yt', 'youtube', 'ytsearch', 'searchyt'],
    category: CAT,
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴄʜᴇʀᴄʜᴇ YouTube 🎵',
    usage: `${PFX}yts <titre>`,
    async execute(sock, msg, args, extra) {
      const { reply, from, sender, phrases } = extra;
      const { blocked, remaining } = checkCD('yts', sender);
      if (blocked) return reply(`*⏳ ${SC('cooldown')} : ${remaining}s*\n\n${phrases.footer()}`);
      if (!args.length) return reply(`*📌 ${SC('usage')} :* \`${PFX}yts <titre>\`\n\n${phrases.footer()}`);

      const query = args.join(' ');
      await sock.sendMessage(from, { react: { text: '🎵', key: msg.key } }).catch(()=>{});

      try {
        const results = await searchYouTube(query);
        let text =
          `╭╼≪• *🎵 YouTube : ${query}* •≫╾╮\n┃\n`;

        results.forEach((v, i) => {
          text += `┃ *${i+1}.* ${v.title}\n`;
          text += `┃    📺 ${v.author}`;
          if (v.duration) text += ` | ⏱️ ${v.duration}`;
          if (v.views)    text += ` | 👁️ ${v.views}`;
          text += `\n┃    🔗 ${v.url}\n┃\n`;
        });

        text += `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;
        await reply(text);
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
      } catch (err) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
        await reply(`*❌ ${SC('aucun résultat pour')} : "${query}"*\n\n${phrases.footer()}`);
      }
    }
  },
];
