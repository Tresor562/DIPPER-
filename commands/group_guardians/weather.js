/**
 * Weather Command - Get weather information using OpenWeather API
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

const axios = require('axios');

// Fonction pour le style Small Caps (Cohérence visuelle du sanctuaire)
function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

  const cleanedText = text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 

  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

module.exports = {
  name: 'meteo',
  aliases: ['w', 'clima'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴠᴇʟᴇ ʟᴇs ᴄᴏɴᴅɪᴛɪᴏɴs ᴄᴇʟᴇsᴛᴇs ᴅ\'ᴜɴᴇ ᴄɪᴛᴇ',
  usage: '.meteo <ville>',
  
  async execute(sock, msg, args) {
    try {
      if (args.length === 0) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: `*⚠️ ${toSmallCaps('usage')} : .${toSmallCaps('meteo')} <${toSmallCaps('ville')}>*\n\n*${toSmallCaps('exemple')} : .${toSmallCaps('meteo')} paris*\n\n${extra.phrases.footer()}` 
        }, { quoted: msg });
      }
      
      const city = args.join(' ');
      const apiKey = '4902c0f2550f58298ad4146a92b65e10';
      
      const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
      const weather = response.data;
      
      // Extraction du code pays (ex: FR, US, CA)
      const countryCode = weather.sys.country;
      
      const weatherText = `*╭╼≪• ᴀᴜʀᴀ ᴄᴇ́ʟᴇsᴛᴇ •≫━╾╮*\n` +
                         `*┃ 🔮 ᴄɪᴛᴇ́* :${weather.name}\n` +
                         `*┃ 🌍 ᴘᴀʏs* :${countryCode}\n` +
                         `*┃ 📜 ᴇ́ᴛᴀᴛ* :${weather.weather[0].description}\n` +
                         `*┃ 🌡️ ᴛᴇᴍᴘᴇ́ʀᴀᴛᴜʀᴇ* : ${weather.main.temp}°C\n` +
                          `*╰━━━━━━━━━━━━━━━━╯*\n\n` +
                          extra.phrases.footer();
      
      await sock.sendMessage(msg.key.remoteJid, { text: weatherText }, { quoted: msg });
      
    } catch (error) {
      console.error('Error fetching weather:', error);
      await sock.sendMessage(msg.key.remoteJid, { 
        text: `*❌ ${toSmallCaps('l\'oracle a echoue a sonder les cieux pour cette cite')}.*\n\n${extra.phrases.footer()}` 
      }, { quoted: msg });
    }
  }
};
