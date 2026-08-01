/**
 * Lyrics Command — 𝐃𝐚𝐫𝐤 Edition (search_tools)
 * .lyrics <artiste - titre>
 * FIX : commande originale n'utilisait pas extra correctement
 * APIs en cascade : lyrics.ovh → api.lyrics.az → genius (scraping léger)
 * Cooldown : 10s anti-spam
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

async function getLyrics(artist, title) {
  // API 1 : lyrics.ovh (gratuit, JSON)
  try {
    const res = await axios.get(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      { timeout: 10000 }
    );
    if (res.data?.lyrics) return { lyrics: res.data.lyrics.trim(), source: 'lyrics.ovh' };
  } catch (_) {}

  // API 2 : lrclib.net (gratuit, supporte artiste + titre)
  try {
    const res = await axios.get('https://lrclib.net/api/search', {
      params: { artist_name: artist, track_name: title },
      timeout: 10000,
    });
    const item = res.data?.[0];
    if (item?.plainLyrics) return { lyrics: item.plainLyrics.trim(), source: 'lrclib.net', duration: item.duration };
  } catch (_) {}

  // API 3 : Recherche par titre seul
  try {
    const query = `${artist} ${title}`;
    const res   = await axios.get('https://lrclib.net/api/search', {
      params: { q: query }, timeout: 10000,
    });
    const item = res.data?.[0];
    if (item?.plainLyrics) return { lyrics: item.plainLyrics.trim(), source: 'lrclib.net' };
  } catch (_) {}

  throw new Error('Paroles introuvables pour cette chanson');
}

module.exports = {
  name: 'lyrics', aliases: ['lyric', 'paroles', 'lirik', 'cantique'],
  category: CAT,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘᴀʀᴏʟᴇs ᴅ\'ᴜɴᴇ ᴄʜᴀɴsᴏɴ 🎶',
  usage: `${PFX}lyrics <artiste> - <titre>`,

  async execute(sock, msg, args, extra) {
    // FIX : utilisation correcte de extra
    const { reply, from, sender, phrases } = extra;
    const { blocked, remaining } = checkCD('lyrics', sender);
    if (blocked) return reply(`*⏳ ${SC('cooldown')} : ${remaining}s*\n\n${phrases.footer()}`);

    if (!args.length) {
      return reply(
        `*📌 ${SC('usage')} :*\n` +
        `\`${PFX}lyrics Burna Boy - Ye\`\n` +
        `\`${PFX}lyrics Dadju - Jaloux\`\n\n${phrases.footer()}`
      );
    }

    const raw = args.join(' ');
    // Séparation artiste / titre par " - "
    let artist = '', title = '';
    if (raw.includes(' - ')) {
      [artist, ...rest] = raw.split(' - ');
      title = rest.join(' - ');
    } else {
      // Tentative avec uniquement le titre
      artist = '';
      title  = raw;
    }

    await sock.sendMessage(from, { react: { text: '🎶', key: msg.key } }).catch(()=>{});

    try {
      const { lyrics, source, duration } = await getLyrics(artist || title, title);

      // Tronquer si trop long pour WhatsApp (limite ~65k chars)
      const maxChars = 3000;
      const truncated = lyrics.length > maxChars;
      const displayLyrics = truncated ? lyrics.slice(0, maxChars) + '\n…[tronqué]' : lyrics;

      await reply(
        `╭╼≪• *🎶 ${SC('paroles')}* •≫╾╮\n` +
        `┃\n` +
        `┃ 🎤 *${artist || SC('artiste inconnu')}*\n` +
        `┃ 🎵 *${title}*\n` +
        (duration ? `┃ ⏱️ ${Math.floor(duration/60)}:${String(Math.round(duration%60)).padStart(2,'0')}\n` : '') +
        `┃ 🌐 *${SC('source')}* : ${source}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        displayLyrics + '\n\n' + phrases.footer()
      );
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('paroles introuvables')} : "${raw}"*\n\n${phrases.footer()}`);
    }
  }
};
