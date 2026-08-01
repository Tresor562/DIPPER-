/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║      𝐃𝐚𝐫𝐤 — Commandes ANIME (catégorie complète)      ║
 * ║  Fichier : commands/anime/anime.js                      ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * COMMANDES :
 *  .waifu        → Image waifu aléatoire
 *  .waifuhd      → Waifu HD (premium)
 *  .neko         → Image neko aléatoire
 *  .animequote   → Citation anime stylée
 *  .character    → Recherche personnage anime
 *  .manga        → Recherche manga
 *  .amv          → AMV aléatoire (lien)
 *  .amvhd        → AMV HD premium
 *  .opening      → Opening anime aléatoire
 *  .openingvip   → Opening premium exclusif
 *  .cosplay      → Image cosplay aléatoire
 *  .cosplayvip   → Cosplay premium
 *
 * APIs utilisées (toutes gratuites, sans clé) :
 *  - waifu.pics  : images waifu/neko/cosplay
 *  - api.jikan.moe (Jikan) : personnages, mangas
 *  - animechan.xyz : citations anime
 *
 * DÉPENDANCES : axios (déjà présent)
 */

const axios  = require('axios');
const config = require('../../config');
const { isPremium } = require('../../utils/premiumDB');

// ── Utilitaire Small Caps ──────────────────────────────────────────────────
function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// ── Guard premium ──────────────────────────────────────────────────────────
function premiumGuard(isOwner, sender, reply, phrases, isSupremeOwner) {
  if (!isOwner && !isSupremeOwner && !isPremium(sender)) {
    reply(
      `╭╼≪• *🚫 ʀᴇsᴇʀᴠᴇ́ ᴘʀᴇᴍɪᴜᴍ* •≫╾╮\n` +
      `┃\n` +
      `┃ *${toSC('cette version est reservee aux elus.')}*\n` +
      `┃ *${toSC('contacte le owner pour en beneficier')}*\n` +
      `┃\n` +
      `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
    );
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Récupère une image anime avec cascade d'APIs de secours
 */
async function getWaifuPicsImage(type = 'waifu') {
  const errors = [];

  // API 1 : waifu.pics
  try {
    const res = await axios.get(`https://api.waifu.pics/sfw/${type}`, {
      timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (res.data?.url) return res.data.url;
  } catch (e) { errors.push(`waifu.pics: ${e.message}`); }

  // API 2 : nekos.best
  const nekosMap = { waifu: 'waifu', neko: 'neko', megumin: 'megumin', shinobu: 'shinobu', cosplay: 'kitsune' };
  try {
    const res = await axios.get(`https://nekos.best/api/v2/${nekosMap[type] || 'waifu'}`, {
      timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const url = res.data?.results?.[0]?.url;
    if (url) return url;
  } catch (e) { errors.push(`nekos.best: ${e.message}`); }

  // API 3 : waifu.im
  try {
    const res = await axios.get('https://api.waifu.im/search/?included_tags=waifu&is_nsfw=false', {
      timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const url = res.data?.images?.[0]?.url;
    if (url) return url;
  } catch (e) { errors.push(`waifu.im: ${e.message}`); }

  // API 4 : nekos.moe
  try {
    const res = await axios.get('https://nekos.moe/api/v1/random/image?nsfw=false', {
      timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const imgId = res.data?.images?.[0]?.id;
    if (imgId) return `https://nekos.moe/image/${imgId}`;
  } catch (e) { errors.push(`nekos.moe: ${e.message}`); }

  throw new Error(`APIs indisponibles : ${errors.slice(-2).join(' | ')}`);
}

/**
 * Récupère une citation anime depuis animechan
 */
async function getAnimeQuote() {
  try {
    const res = await axios.get('https://animechan.io/api/v1/quotes/random', { timeout: 10000 });
    const d = res.data?.data;
    if (!d) throw new Error('Pas de citation');
    return {
      quote    : d.content    || d.quote    || '...',
      character: d.character?.name || d.character || 'Inconnu',
      anime    : d.anime?.name     || d.anime     || 'Inconnu',
    };
  } catch (_) {
    // Fallback citations hardcodées
    const quotes = [
      { quote: 'Je vais devenir le Roi des Pirates !', character: 'Monkey D. Luffy', anime: 'One Piece' },
      { quote: 'Je surpasserai les limites de l\'humanité.', character: 'Isagi Yoichi', anime: 'Blue Lock' },
      { quote: 'L\'ombre ne trahit jamais.', character: 'Cid Kagenou', anime: 'The Eminence in Shadow' },
      { quote: 'Je ne reculerai jamais, c\'est mon ninja way.', character: 'Naruto Uzumaki', anime: 'Naruto' },
      { quote: 'Même dans l\'obscurité, il y a toujours de la lumière.', character: 'Tanjiro Kamado', anime: 'Demon Slayer' },
      { quote: 'Un héros sait toujours quand renoncer... c\'est pour ça qu\'il gagne.', character: 'Deku', anime: 'My Hero Academia' },
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }
}

/**
 * Recherche un personnage via Jikan (API MyAnimeList non officielle)
 * @param {string} name - Nom du personnage
 */
async function searchCharacter(name) {
  const res = await axios.get(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(name)}&limit=1`, {
    timeout: 15000,
  });
  const char = res.data?.data?.[0];
  if (!char) throw new Error(`Personnage "${name}" introuvable`);

  return {
    name        : char.name,
    nameKanji   : char.name_kanji || '',
    image       : char.images?.jpg?.image_url || null,
    about       : (char.about || '').slice(0, 300).replace(/\n/g, ' '),
    animes      : char.anime?.map(a => a.anime?.title).slice(0, 3).join(', ') || 'Non disponible',
    favorites   : char.favorites || 0,
    url         : char.url || '',
  };
}

/**
 * Recherche un manga via Jikan
 * @param {string} name - Nom du manga
 */
async function searchManga(name) {
  const res = await axios.get(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(name)}&limit=1`, {
    timeout: 15000,
  });
  const manga = res.data?.data?.[0];
  if (!manga) throw new Error(`Manga "${name}" introuvable`);

  return {
    title     : manga.title,
    titleEn   : manga.title_english || '',
    image     : manga.images?.jpg?.image_url || null,
    synopsis  : (manga.synopsis || '').slice(0, 350).replace(/\n/g, ' '),
    volumes   : manga.volumes   || '?',
    chapters  : manga.chapters  || '?',
    score     : manga.score     || '?',
    status    : manga.status    || '?',
    genres    : manga.genres?.map(g => g.name).join(', ') || '?',
    authors   : manga.authors?.map(a => a.name).slice(0, 2).join(', ') || '?',
    url       : manga.url || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTES AMV / OPENING (collections de liens YouTube vérifiés)
// ─────────────────────────────────────────────────────────────────────────────
const AMV_LIST = [
  'https://www.youtube.com/watch?v=GMbgj9bwlMA', // AMV — Naruto
  'https://www.youtube.com/watch?v=m2u3OkqZhkM', // AMV — Attack on Titan
  'https://www.youtube.com/watch?v=V-2bFKrIz-4', // AMV — Tokyo Ghoul
  'https://www.youtube.com/watch?v=4_Jt2VnJ_xU', // AMV — Demon Slayer
  'https://www.youtube.com/watch?v=XZzZUXnFnm8', // AMV — One Piece
];

const AMV_HD_LIST = [
  'https://www.youtube.com/watch?v=6YB8UqF-Cl8', // AMV HD — Jujutsu Kaisen
  'https://www.youtube.com/watch?v=Q6CaTpfGRDo', // AMV HD — Bleach
  'https://www.youtube.com/watch?v=Rk2pFMi0DBY', // AMV HD — Blue Lock
  'https://www.youtube.com/watch?v=0Jb2JyYL_YI', // AMV HD — Vinland Saga
];

const OPENING_LIST = [
  { title: 'Gurenge — LiSA (Demon Slayer)', url: 'https://www.youtube.com/watch?v=CwkzK-F0Y4k' },
  { title: 'Unravel — TK (Tokyo Ghoul)', url: 'https://www.youtube.com/watch?v=fFOSMqR9a64' },
  { title: 'Blue Bird — Ikimono Gakari (Naruto Shippuden)', url: 'https://www.youtube.com/watch?v=s3vosGJLqtI' },
  { title: 'KING — Kanaria (Ranking of Kings)', url: 'https://www.youtube.com/watch?v=3iQSvr-0jZ8' },
  { title: 'Cry Baby — Official HIGE DANdism (Tokyo Revengers)', url: 'https://www.youtube.com/watch?v=KlexUOwBqaA' },
  { title: 'Homura — LiSA (Demon Slayer: Mugen Train)', url: 'https://www.youtube.com/watch?v=EaQ5-Jmno_Q' },
];

const OPENING_VIP_LIST = [
  { title: 'Bling Bang Bang Born (Mashle S2)', url: 'https://www.youtube.com/watch?v=4jYEMrloC3I' },
  { title: 'Idol — YOASOBI (Oshi no Ko)', url: 'https://www.youtube.com/watch?v=ZRtdQ81jPUQ' },
  { title: 'R.E.D. — Tatsuya Kitani (Jujutsu Kaisen S2)', url: 'https://www.youtube.com/watch?v=7D7Z8fWEGls' },
  { title: 'Shadow — Eminence in Shadow OP', url: 'https://www.youtube.com/watch?v=z41RyapfSXk' },
];

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT DES COMMANDES
// ─────────────────────────────────────────────────────────────────────────────
module.exports = [

  // ─ .waifu ─────────────────────────────────────────────────────────────────
  {
    name    : 'waifu',
    aliases : ['waifuimage', 'wife'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪᴍᴀɢᴇ ᴡᴀɪғᴜ ᴀʟᴇ́ᴀᴛᴏɪʀᴇ',
    usage   : `${config.prefix || '.'}waifu`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases, from } = extra;
      try {
        const imgUrl = await getWaifuPicsImage('waifu');
        const imgBuf = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(from, {
          image  : Buffer.from(imgBuf.data),
          caption:
            `╭╼≪• *🌸 ᴡᴀɪғᴜ* •≫╾╮\n` +
            `┃\n` +
            `┃ ✦ *${toSC('une ame du sanctuaire t observe')}*\n` +
            `┃ 🌑 *${toSC('prends soin d elle')}...*\n` +
            `┃\n` +
            `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
        }, { quoted: msg });
      } catch (err) {
        await reply(`*❌ ${toSC('erreur waifu')} : ${err.message.slice(0, 80)}*\n\n${phrases.footer()}`);
      }
    }
  },

  // ─ .waifuhd (PREMIUM) ─────────────────────────────────────────────────────
  {
    name    : 'waifuhd',
    aliases : ['waifupremium', 'hdwaifu'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴡᴀɪғᴜ ʜᴅ ᴘʀᴇᴍɪᴜᴍ',
    usage   : `${config.prefix || '.'}waifuhd`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases, from, sender, isOwner, isSupremeOwner } = extra;
      if (premiumGuard(isOwner, sender, reply, phrases, isSupremeOwner)) return;

      try {
        // 'megumin' ou 'shinobu' donne souvent de meilleures images HD
        const type   = ['megumin', 'shinobu', 'waifu'][Math.floor(Math.random() * 3)];
        const imgUrl = await getWaifuPicsImage(type);
        const imgBuf = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });

        await sock.sendMessage(from, {
          image  : Buffer.from(imgBuf.data),
          caption:
            `╭╼≪• *🌸 ᴡᴀɪғᴜ ʜᴅ ᴘʀᴇᴍɪᴜᴍ* •≫╾╮\n` +
            `┃\n` +
            `┃ 👑 *${toSC('edition premium — elu uniquement')}*\n` +
            `┃ ✦ *${toSC('la plus pure des ames du sanctuaire')}*\n` +
            `┃ 🌑 *${toSC('qualite')} :* ʜᴅ\n` +
            `┃\n` +
            `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
        }, { quoted: msg });
      } catch (err) {
        await reply(`*❌ ${toSC('erreur waifuhd')} : ${err.message.slice(0, 80)}*\n\n${phrases.footer()}`);
      }
    }
  },

  // ─ .neko ──────────────────────────────────────────────────────────────────
  {
    name    : 'neko',
    aliases : ['catgirl', 'nekogirl'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪᴍᴀɢᴇ ɴᴇᴋᴏ ᴀʟᴇ́ᴀᴛᴏɪʀᴇ',
    usage   : `${config.prefix || '.'}neko`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases, from } = extra;
      try {
        const imgUrl = await getWaifuPicsImage('neko');
        const imgBuf = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(from, {
          image  : Buffer.from(imgBuf.data),
          caption:
            `╭╼≪• *🐾 ɴᴇᴋᴏ* •≫╾╮\n` +
            `┃\n` +
            `┃ ✦ *${toSC('une neko surgit de l ombre')}*\n` +
            `┃ 🌙 *${toSC('elle t observe en silence')}...*\n` +
            `┃\n` +
            `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
        }, { quoted: msg });
      } catch (err) {
        await reply(`*❌ ${toSC('erreur neko')} : ${err.message.slice(0, 80)}*\n\n${phrases.footer()}`);
      }
    }
  },

  // ─ .animequote ────────────────────────────────────────────────────────────
  {
    name    : 'animequote',
    aliases : ['quote', 'aniquote', 'animecitation'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄɪᴛᴀᴛɪᴏɴ ᴀɴɪᴍᴇ sᴛʏʟᴇ́ᴇ',
    usage   : `${config.prefix || '.'}animequote`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases } = extra;
      try {
        const q = await getAnimeQuote();
        await reply(
          `⠀\n` +
          `*「 ᴀɴɪᴍᴇ ǫᴜᴏᴛᴇ 」*\n` +
          `⠀\n` +
          `*❝ ${q.quote} ❞*\n` +
          `⠀\n` +
          `*— ${toSC(q.character)}*\n` +
          `*📺 ${toSC(q.anime)}*\n` +
          `⠀\n` +
          phrases.footer()
        );
      } catch (err) {
        await reply(`*❌ ${toSC('erreur citation')} : ${err.message.slice(0, 80)}*\n\n${phrases.footer()}`);
      }
    }
  },

  // ─ .character ─────────────────────────────────────────────────────────────
  {
    name    : 'character',
    aliases : ['char', 'perso', 'personnage'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴄʜᴇʀᴄʜᴇ ᴅᴇ ᴘᴇʀsᴏɴɴᴀɢᴇ ᴀɴɪᴍᴇ',
    usage   : `${config.prefix || '.'}character <nom>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases, from } = extra;
      const name = args.join(' ').trim();

      if (!name) {
        return reply(`*⚠️ ${toSC('indique un nom de personnage')} : \`${config.prefix}character Naruto\`*\n\n${phrases.footer()}`);
      }

      try {
        await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });
        const char = await searchCharacter(name);

        const caption =
          `╭╼≪• *🎴 ᴘᴇʀsᴏɴɴᴀɢᴇ ᴀɴɪᴍᴇ* •≫╾╮\n` +
          `┃\n` +
          `┃ 🌟 *${toSC('nom')} :* ${char.name}\n` +
          (char.nameKanji ? `┃ 🇯🇵 *${toSC('japonais')} :* ${char.nameKanji}\n` : '') +
          `┃ 📺 *${toSC('anime')} :* ${toSC(char.animes)}\n` +
          `┃ ❤️ *${toSC('favoris')} :* ${char.favorites.toLocaleString()}\n` +
          (char.about ? `┃\n┃ 📝 *${toSC('description')} :*\n┃ ${toSC(char.about.slice(0, 200))}...\n` : '') +
          `┃\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;

        if (char.image) {
          const imgBuf = await axios.get(char.image, { responseType: 'arraybuffer', timeout: 15000 });
          await sock.sendMessage(from, {
            image  : Buffer.from(imgBuf.data),
            caption,
          }, { quoted: msg });
        } else {
          await reply(caption);
        }
      } catch (err) {
        await reply(`*❌ ${toSC('personnage introuvable')} : ${err.message.slice(0, 80)}*\n\n${phrases.footer()}`);
      }
    }
  },

  // ─ .manga ─────────────────────────────────────────────────────────────────
  {
    name    : 'manga',
    aliases : ['mangainfo', 'searchmanga'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴄʜᴇʀᴄʜᴇ ᴅᴇ ᴍᴀɴɢᴀ',
    usage   : `${config.prefix || '.'}manga <nom>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases, from } = extra;
      const name = args.join(' ').trim();

      if (!name) {
        return reply(`*⚠️ ${toSC('indique un nom de manga')} : \`${config.prefix}manga One Piece\`*\n\n${phrases.footer()}`);
      }

      try {
        await sock.sendMessage(from, { react: { text: '📖', key: msg.key } });
        const m = await searchManga(name);

        const caption =
          `╭╼≪• *📖 ᴍᴀɴɢᴀ ɪɴғᴏ* •≫╾╮\n` +
          `┃\n` +
          `┃ 📚 *${toSC('titre')} :* ${m.title}\n` +
          (m.titleEn ? `┃ 🌐 *${toSC('anglais')} :* ${m.titleEn}\n` : '') +
          `┃ ✍️ *${toSC('auteur')} :* ${toSC(m.authors)}\n` +
          `┃ 📊 *${toSC('score')} :* ${m.score} / 10\n` +
          `┃ 📕 *${toSC('volumes')} :* ${m.volumes}\n` +
          `┃ 📄 *${toSC('chapitres')} :* ${m.chapters}\n` +
          `┃ 🔖 *${toSC('statut')} :* ${toSC(m.status)}\n` +
          `┃ 🏷️ *${toSC('genres')} :* ${toSC(m.genres)}\n` +
          (m.synopsis ? `┃\n┃ 📝 *${toSC('synopsis')} :*\n┃ ${toSC(m.synopsis.slice(0, 250))}...\n` : '') +
          `┃\n` +
          `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;

        if (m.image) {
          const imgBuf = await axios.get(m.image, { responseType: 'arraybuffer', timeout: 15000 });
          await sock.sendMessage(from, {
            image  : Buffer.from(imgBuf.data),
            caption,
          }, { quoted: msg });
        } else {
          await reply(caption);
        }
      } catch (err) {
        await reply(`*❌ ${toSC('manga introuvable')} : ${err.message.slice(0, 80)}*\n\n${phrases.footer()}`);
      }
    }
  },

  // ─ .amv ───────────────────────────────────────────────────────────────────
  {
    name    : 'amv',
    aliases : ['animemv', 'musicvideo'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴍᴠ ᴀʟᴇ́ᴀᴛᴏɪʀᴇ',
    usage   : `${config.prefix || '.'}amv`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases } = extra;
      const link = randomFrom(AMV_LIST);
      await reply(
        `╭╼≪• *🎬 ᴀᴍᴠ ᴀɴɪᴍᴇ* •≫╾╮\n` +
        `┃\n` +
        `┃ 🎵 *${toSC('anime music video selectionne')}*\n` +
        `┃ 🔗 ${link}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }
  },

  // ─ .amvhd (PREMIUM) ───────────────────────────────────────────────────────
  {
    name    : 'amvhd',
    aliases : ['amvpremium', 'hdamv'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴍᴠ ʜᴅ ᴘʀᴇᴍɪᴜᴍ',
    usage   : `${config.prefix || '.'}amvhd`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases, sender, isOwner, isSupremeOwner } = extra;
      if (premiumGuard(isOwner, sender, reply, phrases, isSupremeOwner)) return;

      const link = randomFrom(AMV_HD_LIST);
      await reply(
        `╭╼≪• *🎬 ᴀᴍᴠ ʜᴅ ᴘʀᴇᴍɪᴜᴍ* •≫╾╮\n` +
        `┃\n` +
        `┃ 👑 *${toSC('amv haute definition — premium')}*\n` +
        `┃ 🔗 ${link}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }
  },

  // ─ .opening ───────────────────────────────────────────────────────────────
  {
    name    : 'opening',
    aliases : ['animeop', 'op'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴏᴘᴇɴɪɴɢ ᴀɴɪᴍᴇ ᴀʟᴇ́ᴀᴛᴏɪʀᴇ',
    usage   : `${config.prefix || '.'}opening`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases } = extra;
      const op = randomFrom(OPENING_LIST);
      await reply(
        `╭╼≪• *🎵 ᴏᴘᴇɴɪɴɢ ᴀɴɪᴍᴇ* •≫╾╮\n` +
        `┃\n` +
        `┃ 🎶 *${toSC('titre')} :* ${toSC(op.title)}\n` +
        `┃ 🔗 ${op.url}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }
  },

  // ─ .openingvip (PREMIUM) ──────────────────────────────────────────────────
  {
    name    : 'openingvip',
    aliases : ['opvip', 'openingpremium'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴏᴘᴇɴɪɴɢ ᴘʀᴇᴍɪᴜᴍ ᴇxᴄʟᴜsɪғ',
    usage   : `${config.prefix || '.'}openingvip`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases, sender, isOwner, isSupremeOwner } = extra;
      if (premiumGuard(isOwner, sender, reply, phrases, isSupremeOwner)) return;

      const op = randomFrom(OPENING_VIP_LIST);
      await reply(
        `╭╼≪• *🎵 ᴏᴘᴇɴɪɴɢ ᴠɪᴘ ᴘʀᴇᴍɪᴜᴍ* •≫╾╮\n` +
        `┃\n` +
        `┃ 👑 *${toSC('edition exclusive — elus uniquement')}*\n` +
        `┃ 🎶 *${toSC('titre')} :* ${toSC(op.title)}\n` +
        `┃ 🔗 ${op.url}\n` +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }
  },

  // ─ .cosplay ───────────────────────────────────────────────────────────────
  {
    name    : 'cosplay',
    aliases : ['cos', 'cosplayer'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪᴍᴀɢᴇ ᴄᴏsᴘʟᴀʏ ᴀʟᴇ́ᴀᴛᴏɪʀᴇ',
    usage   : `${config.prefix || '.'}cosplay`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases, from } = extra;
      try {
        const imgUrl = await getWaifuPicsImage('cosplay');
        const imgBuf = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(from, {
          image  : Buffer.from(imgBuf.data),
          caption:
            `╭╼≪• *🎭 ᴄᴏsᴘʟᴀʏ* •≫╾╮\n` +
            `┃\n` +
            `┃ ✦ *${toSC('un artiste de l ombre se revele')}*\n` +
            `┃ 🌸 *${toSC('l anime prend vie')}...*\n` +
            `┃\n` +
            `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
        }, { quoted: msg });
      } catch (err) {
        await reply(`*❌ ${toSC('erreur cosplay')} : ${err.message.slice(0, 80)}*\n\n${phrases.footer()}`);
      }
    }
  },

  // ─ .cosplayvip (PREMIUM) ──────────────────────────────────────────────────
  {
    name    : 'cosplayvip',
    aliases : ['cosplaypremium', 'hdcosplay'],
    category: '🌸 Anime',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏsᴘʟᴀʏ ᴘʀᴇᴍɪᴜᴍ',
    usage   : `${config.prefix || '.'}cosplayvip`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,

    async execute(sock, msg, args, extra) {
      const { reply, phrases, from, sender, isOwner, isSupremeOwner } = extra;
      if (premiumGuard(isOwner, sender, reply, phrases, isSupremeOwner)) return;

      try {
        // Alterne entre plusieurs catégories pour la variété
        const types  = ['cosplay', 'megumin', 'shinobu'];
        const type   = randomFrom(types);
        const imgUrl = await getWaifuPicsImage(type);
        const imgBuf = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });

        await sock.sendMessage(from, {
          image  : Buffer.from(imgBuf.data),
          caption:
            `╭╼≪• *🎭 ᴄᴏsᴘʟᴀʏ ᴠɪᴘ ᴘʀᴇᴍɪᴜᴍ* •≫╾╮\n` +
            `┃\n` +
            `┃ 👑 *${toSC('edition premium — exclusif')}*\n` +
            `┃ ✦ *${toSC('l ombre prend forme humaine')}*\n` +
            `┃ 🌑 *${toSC('qualite')} :* ʜᴅ\n` +
            `┃\n` +
            `╰━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
        }, { quoted: msg });
      } catch (err) {
        await reply(`*❌ ${toSC('erreur cosplayvip')} : ${err.message.slice(0, 80)}*\n\n${phrases.footer()}`);
      }
    }
  },
];
