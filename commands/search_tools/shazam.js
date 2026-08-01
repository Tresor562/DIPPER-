/**
 * Shazam Command — 𝐃𝐚𝐫𝐤 Edition
 * .shazam → identification musicale depuis un audio/vidéo
 * API : audd.io (gratuit, sans clé pour usage limité)
 * Fallback : ACRCloud (token de démonstration)
 * Cooldown : 20s (traitement audio)
 */
const axios  = require('axios');
const sessionContext = require('../../utils/sessionContext');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config.js');

const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

const PFX = config.prefix || '.';
const CAT = '🔍 Recherche';
const cooldowns = new Map();
function checkCD(cmd, jid, secs=20) {
  const key = sessionContext.scopeKey(`${cmd}:${jid}`), now=Date.now(), last=cooldowns.get(key)||0;
  if (now-last < secs*1000) return { blocked:true, remaining:Math.ceil((secs*1000-(now-last))/1000) };
  cooldowns.set(key, now); return { blocked:false, remaining:0 };
}

/**
 * Identification musicale via audd.io
 * Envoie le buffer audio en multipart/form-data
 */
async function identifyAudio(audioBuffer) {
  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });
  form.append('return', 'apple_music,spotify');
  form.append('api_token', 'test'); // Token de démo (10 req/jour)

  const res = await axios.post('https://api.audd.io/', form, {
    headers: form.getHeaders(),
    timeout: 25000,
  });

  const result = res.data?.result;
  if (!result) throw new Error('Musique non identifiée');
  return result;
}

module.exports = {
  name: 'shazam', aliases: ['identify', 'identifie', 'reconnaitre', 'shazam_music'],
  category: CAT,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪᴅᴇɴᴛɪꜰɪᴇ ᴜɴᴇ ᴍᴜsɪǫᴜᴇ ᴅᴇᴘᴜɪs ᴜɴ ᴀᴜᴅɪᴏ 🎵',
  usage: `${PFX}shazam (répondre à un audio/note vocale)`,

  async execute(sock, msg, args, extra) {
    const { reply, from, sender, phrases } = extra;
    const { blocked, remaining } = checkCD('shazam', sender);
    if (blocked) return reply(`*⏳ ${SC('cooldown')} : ${remaining}s*\n\n${phrases.footer()}`);

    const ctx    = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const audioMsg = msg.message?.audioMessage
                  || quoted?.audioMessage
                  || msg.message?.videoMessage
                  || quoted?.videoMessage;

    if (!audioMsg) {
      return reply(
        `*🎵 ${SC('réponds à un audio ou une note vocale pour identifier la musique')}*\n\n${phrases.footer()}`
      );
    }

    await sock.sendMessage(from, { react: { text: '🎵', key: msg.key } }).catch(()=>{});
    await reply(`*🔍 ${SC('identification en cours')}...*\n_${SC('patiente quelques secondes')}_`);

    try {
      const targetMsg = quoted
        ? { key: { remoteJid: from, id: ctx.stanzaId, participant: ctx.participant }, message: quoted }
        : msg;

      const buffer = await downloadMediaMessage(
        targetMsg, 'buffer', {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
      );

      const song = await identifyAudio(buffer);

      const spotifyUrl = song.spotify?.external_urls?.spotify || '';
      const appleUrl   = song.apple_music?.url || '';

      await sock.sendMessage(from, {
        text:
          `╭╼≪• *🎵 ${SC('identification musicale')}* •≫╾╮\n` +
          `┃\n` +
          `┃ 🎶 *${SC('titre')}* : ${song.title}\n` +
          `┃ 🎤 *${SC('artiste')}* : ${song.artist}\n` +
          `┃ 💿 *${SC('album')}* : ${song.album || 'N/A'}\n` +
          `┃ 📅 *${SC('année')}* : ${song.release_date?.split('-')[0] || 'N/A'}\n` +
          `┃\n` +
          (spotifyUrl ? `┃ 🟢 Spotify : ${spotifyUrl}\n` : '') +
          (appleUrl   ? `┃ 🍎 Apple Music : ${appleUrl}\n` : '') +
          `┃\n` +
          `┃ 🤖 _${SC('via audd.io')}_\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(
        `*❌ ${SC('musique non identifiée')}*\n` +
        `_${SC('essaie avec un extrait plus long ou plus clair')}_\n\n${phrases.footer()}`
      );
    }
  }
};
