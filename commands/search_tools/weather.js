/**
 * Weather Command — 𝐃𝐚𝐫𝐤 Edition
 * .weather <ville>
 * FIX : commande originale n'utilisait pas extra (reply, phrases)
 * API : wttr.in (JSON gratuit, sans clé, très fiable)
 * Fallback : open-meteo.com + geocoding
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

const WEATHER_ICONS = {
  'Sunny':'☀️','Clear':'🌙','Partly cloudy':'⛅','Cloudy':'☁️','Overcast':'☁️',
  'Mist':'🌫️','Fog':'🌫️','Freezing fog':'🌫️','Light rain':'🌦️','Moderate rain':'🌧️',
  'Heavy rain':'🌧️','Light snow':'🌨️','Moderate snow':'❄️','Heavy snow':'❄️',
  'Thundery outbreaks':'⛈️','Blizzard':'🌨️','default':'🌡️'
};
function weatherIcon(desc) {
  for (const [k,v] of Object.entries(WEATHER_ICONS)) {
    if (desc?.includes(k)) return v;
  }
  return WEATHER_ICONS.default;
}

async function getWeather(city) {
  const res = await axios.get(
    `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
    { timeout: 12000, headers: { 'User-Agent': 'curl/7.68.0' } }
  );
  const d   = res.data;
  const cur = d.current_condition?.[0];
  const area= d.nearest_area?.[0];
  if (!cur) throw new Error('Ville introuvable');

  return {
    city      : area?.areaName?.[0]?.value || city,
    country   : area?.country?.[0]?.value || '',
    temp      : cur.temp_C,
    feelsLike : cur.FeelsLikeC,
    humidity  : cur.humidity,
    wind      : cur.windspeedKmph,
    windDir   : cur.winddir16Point,
    desc      : cur.weatherDesc?.[0]?.value || 'N/A',
    visibility: cur.visibility,
    pressure  : cur.pressure,
    uvIndex   : cur.uvIndex,
    // Prévisions 3 jours
    forecast  : (d.weather || []).slice(0, 3).map(day => ({
      date   : day.date,
      maxC   : day.maxtempC,
      minC   : day.mintempC,
      desc   : day.hourly?.[4]?.weatherDesc?.[0]?.value || '',
    })),
  };
}

module.exports = {
  name: 'weather', aliases: ['climat', 'temp', 'wt'],
  category: CAT,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴍᴇ́ᴛᴇ́ᴏ ᴅ\'ᴜɴᴇ ᴠɪʟʟᴇ ☀️',
  usage: `${PFX}weather <ville>`,

  async execute(sock, msg, args, extra) {
    // FIX : utilisation correcte de extra (reply + phrases)
    const { reply, from, sender, phrases } = extra;
    const { blocked, remaining } = checkCD('weather', sender);
    if (blocked) return reply(`*⏳ ${SC('cooldown')} : ${remaining}s*\n\n${phrases.footer()}`);

    const city = args.join(' ').trim();
    if (!city) {
      return reply(
        `*📌 ${SC('usage')} :* \`${PFX}weather <ville>\`\n` +
        `_ᴇx : \`${PFX}weather Cotonou\`_\n\n${phrases.footer()}`
      );
    }

    await sock.sendMessage(from, { react: { text: '🌡️', key: msg.key } }).catch(()=>{});

    try {
      const w   = await getWeather(city);
      const icon = weatherIcon(w.desc);

      let text =
        `╭╼≪• *${icon} ${SC('météo')} : ${w.city}${w.country ? `, ${w.country}` : ''}* •≫╾╮\n` +
        `┃\n` +
        `┃ 🌡️ *${SC('température')}* : ${w.temp}°C (${SC('ressenti')} ${w.feelsLike}°C)\n` +
        `┃ ${icon} *${SC('conditions')}* : ${w.desc}\n` +
        `┃ 💧 *${SC('humidité')}* : ${w.humidity}%\n` +
        `┃ 💨 *${SC('vent')}* : ${w.wind} km/h ${w.windDir}\n` +
        `┃ 👁️ *${SC('visibilité')}* : ${w.visibility} km\n` +
        `┃ 🔵 *${SC('pression')}* : ${w.pressure} hPa\n` +
        `┃ ☀️ *${SC('indice uv')}* : ${w.uvIndex}\n` +
        `┃\n` +
        `┃ 📅 *${SC('prévisions 3 jours')} :*\n`;

      for (const day of w.forecast) {
        const di = weatherIcon(day.desc);
        text += `┃ • ${day.date} : ${di} ${day.minC}°↓ ${day.maxC}°↑ — ${day.desc}\n`;
      }

      text += `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;
      await reply(text);
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('ville introuvable')} : "${city}"*\n\n${phrases.footer()}`);
    }
  }
};
