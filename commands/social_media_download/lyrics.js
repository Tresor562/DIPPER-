/**
 * Lyrics Finder - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Récupère les paroles d'un cantique dans le sanctuaire
 */

const axios = require('axios');
const config = require('../../config');
const prefix = config.prefix || '.';
module.exports = {
  name: 'ᴄᴀɴᴛɪǫᴜᴇ',
  aliases: ['dl_cantique', 'dl_lyrics', 'dl_lyric', 'dl_lirik'],
  category: '📥 Téléchargements',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇ́ᴠᴇ̀ʟᴇ ʟᴇs ᴘᴀʀᴏʟᴇs ᴅ\'ᴜɴᴇ ᴄʜᴀɴsᴏɴ',
  usage: `${prefix}ᴄᴀɴᴛɪǫᴜᴇ <ɴᴏᴍ ᴅᴇ ʟᴀ ᴄʜᴀɴsᴏɴ>`,
  
  async execute(sock, msg, args) {
    try {
      const prefix = config.prefix || '.';
      
      if (args.length === 0) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: `*〆ᴍᴜʀᴍᴜʀᴇ ʟᴇ ɴᴏᴍ ᴅ'ᴜɴᴇ ᴘɪᴇ̀ᴄᴇ ᴍᴜsɪᴄᴀʟᴇ !*\n\n*ᴇxᴇᴍᴘʟᴇ : ${prefix}ᴄᴀɴᴛɪǫᴜᴇ ᴅᴇsᴘᴀᴄɪᴛᴏ*` 
        });
      }
      
      const query = args.join(' ');
      let lyricsData = null;
      
      // --- API 1: Vreden ---
      try {
        const response = await axios.get(`https://api.vreden.my.id/api/lyrics?query=${encodeURIComponent(query)}`, { timeout: 5000 });
        if (response.data && response.data.result) {
          lyricsData = {
            title: response.data.result.title,
            artist: response.data.result.artist,
            lyrics: response.data.result.lyrics,
            thumbnail: response.data.result.thumbnail
          };
        }
      } catch (err) {
        console.log('Vreden API failed, trying next...');
      }
      
      // --- API 2: Siputzx (fallback 1) ---
      if (!lyricsData) {
        try {
          const response = await axios.get(`https://api.siputzx.my.id/api/s/lyrics?query=${encodeURIComponent(query)}`, { timeout: 5000 });
          if (response.data && response.data.status && response.data.data) {
            lyricsData = {
              title: response.data.data.title,
              artist: response.data.data.artist,
              lyrics: response.data.data.lyrics,
              thumbnail: response.data.data.image
            };
          }
        } catch (err) {
          console.log('Siputzx API failed, trying LRCLIB...');
        }
      }

      // --- API 3: LRCLIB (Fallback ultime, ultra-stable et sans clé) ---
      if (!lyricsData) {
        try {
          const response = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, { timeout: 5000 });
          if (response.data && response.data.length > 0) {
            // On prend le premier résultat le plus pertinent
            const bestMatch = response.data[0];
            lyricsData = {
              title: bestMatch.trackName,
              artist: bestMatch.artistName,
              lyrics: bestMatch.plainLyrics || bestMatch.syncedLyrics,
              thumbnail: null // LRCLIB ne fournit pas de cover d'album
            };
          }
        } catch (err) {
          console.log('LRCLIB API failed');
        }
      }
      
      if (!lyricsData || !lyricsData.lyrics) {
        return await sock.sendMessage(msg.key.remoteJid, { 
          text: '*〆 ʟ\'ᴏʀᴀᴄʟᴇ ɴ\'ᴀ ᴛʀᴏᴜᴠᴇ́ ᴀᴜᴄᴜɴᴇ ᴘᴀʀᴏʟᴇ ᴘᴏᴜʀ ᴄᴇᴛᴛᴇ ᴏᴇᴜᴠʀᴇ.*' 
        });
      }
      
      // Formatage des paroles (limitation de taille)
      let lyrics = lyricsData.lyrics;
      if (lyrics.length > 4000) {
        lyrics = lyrics.substring(0, 4000) + '\n\n*... [ ʟᴇs ᴘᴀʀᴏʟᴇs sᴏɴᴛ ᴛʀᴏᴘ ʟᴏɴɢᴜᴇs, sᴇᴜʟᴇ ʟᴀ ᴘʀᴇᴍɪᴇ̀ʀᴇ ᴘᴀʀᴛɪᴇ ᴇsᴛ ᴀғғɪᴄʜᴇ́ᴇ ]*';
      }
      
      const botName = (config.botName || 'ɢʜᴏsᴛɢ-x').toUpperCase();
      const caption = `*╭╼≪• ᴀʀᴄᴀɴᴇs ᴍᴜsɪᴄᴀᴜx •≫╾╮*\n` +
                     `*┃ 🎵 ᴛɪᴛʀᴇ :* ${lyricsData.title}\n` +
                     `*┃ 👤 ᴀʀᴛɪsᴛᴇ :* ${lyricsData.artist}\n` +
                     `*╰━━━━━━━━━━━━━━━━━╯*\n\n` +
                     `*📝 ᴘᴀʀᴏʟᴇs :*\n\n${lyrics}\n\n` +
                     extra.phrases.footer();
      
      if (lyricsData.thumbnail) {
        await sock.sendMessage(msg.key.remoteJid, {
          image: { url: lyricsData.thumbnail },
          caption: caption
        });
      } else {
        await sock.sendMessage(msg.key.remoteJid, { text: caption });
      }
      
    } catch (error) {
      console.error('Lyrics command error:', error);
      await sock.sendMessage(msg.key.remoteJid, { 
        text: '*〆 ᴜɴᴇ sɪɴɢᴜʟᴀʀɪᴛᴇ́ ᴇsᴛ sᴜʀᴠᴇɴᴜᴇ ʟᴏʀs ᴅᴇ ʟᴀ ʀᴇᴄʜᴇʀᴄʜᴇ.*' 
      });
    }
  }
};
