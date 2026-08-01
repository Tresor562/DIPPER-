/**
 * AnimeInfo Command - 𝐃𝐚𝐫𝐤 Edition
 * Donne des informations sur un anime ou un webtoon
 * Source : API Jikan (MyAnimeList) + API AniList
 * FIX: extra.phrases.footer() appelé dans buildAnimeMessage/buildWebtoonMessage
 *      alors que extra n'était pas dans scope — fonctions rendues pures
 */

const axios  = require('axios');
const config = require('../../config.js');
const prefix = config.prefix || '.';

function formatEpisodes(eps) {
  if (!eps || eps === 0) return 'ɪɴᴄᴏɴɴᴜ';
  return String(eps);
}

function formatScore(score) {
  if (!score) return 'N/A';
  return `${score}/10`;
}

function formatStatus(status) {
  if (!status) return 'ɪɴᴄᴏɴɴᴜ';
  const map = {
    'Finished Airing'  : '✅ ᴛᴇʀᴍɪɴᴇ́',
    'Currently Airing' : '🟢 ᴇɴ ᴄᴏᴜʀs',
    'Not yet aired'    : '⏳ ᴀ̀ ᴠᴇɴɪʀ',
    'FINISHED'         : '✅ ᴛᴇʀᴍɪɴᴇ́',
    'RELEASING'        : '🟢 ᴇɴ ᴄᴏᴜʀs',
    'NOT_YET_RELEASED' : '⏳ ᴀ̀ ᴠᴇɴɪʀ',
    'CANCELLED'        : '❌ ᴀɴɴᴜʟᴇ́',
    'HIATUS'           : '⏸️ ᴇɴ ᴘᴀᴜsᴇ',
  };
  return map[status] || status;
}

function truncate(text, maxLen = 300) {
  if (!text) return 'ᴀᴜᴄᴜɴᴇ sʏɴᴏᴘsɪs ᴅɪsᴘᴏɴɪʙʟᴇ.';
  const clean = text.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
}

async function searchAnime(query) {
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`;
  const res  = await axios.get(url, { timeout: 10000 });
  const item = res.data?.data?.[0];
  if (!item) return null;

  return {
    type      : 'anime',
    title     : item.title_english || item.title || 'N/A',
    titleJp   : item.title_japanese || '',
    image     : item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
    episodes  : formatEpisodes(item.episodes),
    score     : formatScore(item.score),
    status    : formatStatus(item.status),
    genres    : (item.genres || []).map(g => g.name).join(', ') || 'N/A',
    studio    : (item.studios || []).map(s => s.name).join(', ') || 'N/A',
    year      : item.year || item.aired?.prop?.from?.year || 'N/A',
    synopsis  : truncate(item.synopsis),
    url       : item.url || '',
    rating    : item.rating || 'N/A',
    rank      : item.rank ? `#${item.rank}` : 'N/A',
    popularity: item.popularity ? `#${item.popularity}` : 'N/A',
    members   : item.members ? item.members.toLocaleString() : 'N/A',
    source    : item.source || 'N/A',
    duration  : item.duration || 'N/A',
  };
}

async function searchWebtoon(query) {
  const gql = `
    query ($search: String) {
      Media(search: $search, type: MANGA, format_in: [MANHWA, OEL, ONE_SHOT, NOVEL]) {
        id
        title { romaji english native }
        description(asHtml: false)
        status
        chapters
        volumes
        genres
        averageScore
        popularity
        coverImage { large }
        startDate { year }
        endDate { year }
        siteUrl
        staff(perPage: 3) {
          nodes { name { full } }
        }
      }
    }
  `;
  const res  = await axios.post('https://graphql.anilist.co', {
    query: gql, variables: { search: query }
  }, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 10000
  });

  const item = res.data?.data?.Media;
  if (!item) return null;

  return {
    type      : 'webtoon',
    title     : item.title.english || item.title.romaji || 'N/A',
    titleJp   : item.title.native || '',
    image     : item.coverImage?.large || null,
    chapters  : formatEpisodes(item.chapters),
    volumes   : formatEpisodes(item.volumes),
    score     : item.averageScore ? `${item.averageScore}/100` : 'N/A',
    status    : formatStatus(item.status),
    genres    : (item.genres || []).join(', ') || 'N/A',
    author    : (item.staff?.nodes || []).map(n => n.name.full).join(', ') || 'N/A',
    year      : item.startDate?.year || 'N/A',
    synopsis  : truncate(item.description),
    url       : item.siteUrl || '',
    popularity: item.popularity ? item.popularity.toLocaleString() : 'N/A',
  };
}

async function searchAnimeFallback(query) {
  const gql = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id
        title { romaji english native }
        description(asHtml: false)
        status
        episodes
        duration
        genres
        averageScore
        popularity
        coverImage { large }
        startDate { year }
        studios(isMain: true) { nodes { name } }
        siteUrl
      }
    }
  `;
  const res  = await axios.post('https://graphql.anilist.co', {
    query: gql, variables: { search: query }
  }, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 10000
  });

  const item = res.data?.data?.Media;
  if (!item) return null;

  return {
    type      : 'anime',
    title     : item.title.english || item.title.romaji || 'N/A',
    titleJp   : item.title.native || '',
    image     : item.coverImage?.large || null,
    episodes  : formatEpisodes(item.episodes),
    score     : item.averageScore ? `${item.averageScore}/100` : 'N/A',
    status    : formatStatus(item.status),
    genres    : (item.genres || []).join(', ') || 'N/A',
    studio    : (item.studios?.nodes || []).map(s => s.name).join(', ') || 'N/A',
    year      : item.startDate?.year || 'N/A',
    synopsis  : truncate(item.description),
    url       : item.siteUrl || '',
    popularity: item.popularity ? item.popularity.toLocaleString() : 'N/A',
    duration  : item.duration ? `${item.duration} min/ép` : 'N/A',
  };
}

// FIX: footer passé en paramètre au lieu de extra.phrases.footer() global
function buildAnimeMessage(d, footer) {
  return (
    `╭━≪• *🎌 ɪɴꜰᴏ ᴀɴɪᴍᴇ* •≫━╾╮\n` +
    `┃\n` +
    `┃ 🎴 *ᴛɪᴛʀᴇ* : ${d.title}\n` +
    (d.titleJp ? `┃ 🈴 *ᴊᴀᴘᴏɴᴀɪs* : ${d.titleJp}\n` : '') +
    `┃\n` +
    `┃ 📺 *ᴇ́ᴘɪsᴏᴅᴇs* : ${d.episodes}\n` +
    (d.duration ? `┃ ⏱️ *ᴅᴜʀᴇ́ᴇ* : ${d.duration}\n` : '') +
    `┃ 📅 *ᴀɴɴᴇ́ᴇ* : ${d.year}\n` +
    `┃ ⚙️ *sᴛᴀᴛᴜᴛ* : ${d.status}\n` +
    `┃\n` +
    `┃ ⭐ *sᴄᴏʀᴇ* : ${d.score}\n` +
    (d.rank       ? `┃ 🏆 *ʀᴀɴɢ* : ${d.rank}\n`         : '') +
    (d.popularity ? `┃ 🔥 *ᴘᴏᴘᴜʟᴀʀɪᴛᴇ́* : ${d.popularity}\n` : '') +
    (d.members    ? `┃ 👥 *ᴍᴇᴍʙʀᴇs* : ${d.members}\n`   : '') +
    `┃\n` +
    `┃ 🎭 *ɢᴇɴʀᴇs* : ${d.genres}\n` +
    (d.studio  ? `┃ 🏢 *sᴛᴜᴅɪᴏ* : ${d.studio}\n`   : '') +
    (d.source  ? `┃ 📖 *sᴏᴜʀᴄᴇ* : ${d.source}\n`   : '') +
    (d.rating  ? `┃ 🔞 *ʀᴀᴛɪɴɢ* : ${d.rating}\n`   : '') +
    `┃\n` +
    `┃ 📝 *sʏɴᴏᴘsɪs* :\n` +
    `┃ _${d.synopsis}_\n` +
    (d.url ? `┃\n┃ 🔗 ${d.url}\n` : '') +
    `╰━━━━━━━━━━━━━━━━━╯\n\n${footer}`
  );
}

function buildWebtoonMessage(d, footer) {
  return (
    `╭━≪• *📱 ɪɴꜰᴏ ᴡᴇʙᴛᴏᴏɴ* •≫━╾╮\n` +
    `┃\n` +
    `┃ 📖 *ᴛɪᴛʀᴇ* : ${d.title}\n` +
    (d.titleJp ? `┃ 🈴 *ᴏʀɪɢɪɴᴀʟ* : ${d.titleJp}\n` : '') +
    `┃\n` +
    `┃ 📄 *ᴄʜᴀᴘɪᴛʀᴇs* : ${d.chapters}\n` +
    `┃ 📚 *ᴠᴏʟᴜᴍᴇs* : ${d.volumes}\n` +
    `┃ 📅 *ᴀɴɴᴇ́ᴇ* : ${d.year}\n` +
    `┃ ⚙️ *sᴛᴀᴛᴜᴛ* : ${d.status}\n` +
    `┃\n` +
    `┃ ⭐ *sᴄᴏʀᴇ* : ${d.score}\n` +
    `┃ 🔥 *ᴘᴏᴘᴜʟᴀʀɪᴛᴇ́* : ${d.popularity}\n` +
    `┃\n` +
    `┃ 🎭 *ɢᴇɴʀᴇs* : ${d.genres}\n` +
    `┃ ✍️ *ᴀᴜᴛᴇᴜʀ* : ${d.author}\n` +
    `┃\n` +
    `┃ 📝 *sʏɴᴏᴘsɪs* :\n` +
    `┃ _${d.synopsis}_\n` +
    (d.url ? `┃\n┃ 🔗 ${d.url}\n` : '') +
    `╰━━━━━━━━━━━━━━━━━╯\n\n${footer}`
  );
}

module.exports = {
  name      : 'animeinfo',
  aliases   : ['anime', 'webtoon', 'infoanime', 'ainfo', 'winfo'],
  category: '🛠️ Outils généraux',
  ownerOnly : false,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴏɴɴᴇ ᴅᴇs ɪɴꜰᴏs sᴜʀ ᴜɴ ᴀɴɪᴍᴇ ᴏᴜ ᴜɴ ᴡᴇʙᴛᴏᴏɴ',
  usage     : `${prefix}animeinfo <ɴᴏᴍ> | ${prefix}webtoon <ɴᴏᴍ>`,

  async execute(sock, msg, args, extra) {
    const { reply, react, from, phrases } = extra;
    const footer = phrases.footer();

    if (!args.length) {
      return reply(
        `*📌 ᴜsᴀɢᴇ :*\n` +
        `\`${prefix}animeinfo <nom de l'anime>\`\n` +
        `\`${prefix}webtoon <nom du webtoon>\`\n\n` +
        `*💡 ᴇxᴇᴍᴘʟᴇs :*\n` +
        `\`${prefix}animeinfo Naruto\`\n` +
        `\`${prefix}webtoon Solo Leveling\`\n\n` +
        footer
      );
    }

    const body      = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
    const usedAlias = body.toLowerCase().split(/\s+/)[0].replace(config.prefix || '.', '');
    const isWebtoon = ['webtoon', 'manga', 'winfo'].includes(usedAlias);

    const query = args.join(' ');

    await react('🔍');

    try {
      let data = null;

      if (isWebtoon) {
        data = await searchWebtoon(query);
        if (!data) {
          return reply(
            `*❌ ᴀᴜᴄᴜɴ ᴡᴇʙᴛᴏᴏɴ ᴛʀᴏᴜᴠᴇ́ ᴘᴏᴜʀ :*\n_${query}_\n\n` +
            `_ᴠᴇ́ʀɪꜰɪᴇ ʟ'ᴏʀᴛʜᴏɢʀᴀᴘʜᴇ ᴏᴜ ᴇssᴀɪᴇ ᴇɴ ᴀɴɢʟᴀɪs_\n\n${footer}`
          );
        }
      } else {
        try {
          data = await searchAnime(query);
        } catch (_) {}

        if (!data) {
          data = await searchAnimeFallback(query);
        }

        if (!data) {
          return reply(
            `*❌ ᴀᴜᴄᴜɴ ᴀɴɪᴍᴇ ᴛʀᴏᴜᴠᴇ́ ᴘᴏᴜʀ :*\n_${query}_\n\n` +
            `_ᴠᴇ́ʀɪꜰɪᴇ ʟ'ᴏʀᴛʜᴏɢʀᴀᴘʜᴇ ᴏᴜ ᴇssᴀɪᴇ ᴇɴ ᴀɴɢʟᴀɪs_\n\n${footer}`
          );
        }
      }

      await react('✅');

      // FIX: passer footer en paramètre
      const text = data.type === 'webtoon'
        ? buildWebtoonMessage(data, footer)
        : buildAnimeMessage(data, footer);

      if (data.image) {
        try {
          await sock.sendMessage(from, {
            image  : { url: data.image },
            caption: text,
          }, { quoted: msg });
        } catch (_) {
          await reply(text);
        }
      } else {
        await reply(text);
      }

    } catch (err) {
      console.error('[animeinfo] Erreur:', err.message);
      await react('❌');
      return reply(
        `*〆 ᴇʀʀᴇᴜʀ ʟᴏʀs ᴅᴇ ʟᴀ ʀᴇᴄʜᴇʀᴄʜᴇ*\n\n` +
        `_ᴠᴇ́ʀɪꜰɪᴇ ᴛᴀ ᴄᴏɴɴᴇxɪᴏɴ ɪɴᴛᴇʀɴᴇᴛ ᴇᴛ ʀᴇssᴀɪᴇ._\n\n` +
        footer
      );
    }
  }
};
