/**
 * Browse Command — 𝐃𝐚𝐫𝐤 Edition
 * ─────────────────────────────────
 * .browse <recherche>
 * Effectue une recherche web via DuckDuckGo (JSON, sans clé API)
 * et retourne les 5 meilleurs résultats formatés.
 *
 * API : https://api.duckduckgo.com/?q=...&format=json
 *       Fallback : https://ddg-webapp-aagd.vercel.app/search
 */
const axios  = require('axios');
const config = require('../../config.js');

const SC = t => {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

module.exports = {
  name: 'browse', aliases: ['search', 'web', 'googler', 'chercher', 'ddg'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴄʜᴇʀᴄʜᴇ ᴡᴇʙ ᴠɪᴀ DuckDuckGo',
  usage: `${config.prefix||'.'}browse <texte>`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;
    if (!args.length) {
      return reply(
        `*📌 ᴜsᴀɢᴇ :* \`${config.prefix||'.'}browse <recherche>\`\n` +
        `_ᴇx : \`${config.prefix||'.'}browse Jujutsu Kaisen saison 3\`_\n\n${phrases.footer()}`
      );
    }

    const query = args.join(' ');
    await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } }).catch(()=>{});

    try {
      // DuckDuckGo instant answers API (JSON gratuit, pas de clé)
      const res = await axios.get('https://api.duckduckgo.com/', {
        params: { q: query, format: 'json', no_redirect: 1, no_html: 1, t: 'dark_bot' },
        timeout: 12000,
      });

      const d         = res.data;
      const abstract  = d.Abstract?.slice(0, 350) || '';
      const relTopics = (d.RelatedTopics || []).filter(r => r.Text).slice(0, 4);
      const source    = d.AbstractSource || d.AbstractURL || '';

      let text =
        `╭╼≪• *🔍 ${SC('recherche')} : ${query}* •≫╾╮\n┃\n`;

      if (abstract) {
        text += `┃ 📝 *${SC('résumé')} :*\n┃ _${abstract}_\n┃\n`;
        if (source) text += `┃ 🔗 *${SC('source')} :* ${source}\n┃\n`;
      }

      if (relTopics.length) {
        text += `┃ 🌐 *${SC('résultats liés')} :*\n`;
        relTopics.forEach((r, i) => {
          const title = (r.Text || '').slice(0, 120);
          const link  = r.FirstURL || '';
          text += `┃ ${i+1}. ${title}\n`;
          if (link) text += `┃    🔗 ${link}\n`;
        });
        text += `┃\n`;
      }

      if (!abstract && !relTopics.length) {
        // Fallback : recherche via titre/infobox
        const title = d.Heading || d.Entity || '';
        text += `┃ ⚠️ _${SC('résultats limités pour')} : ${query}_\n┃\n`;
        if (title) text += `┃ 📌 ${title}\n┃\n`;
        text += `┃ 🔗 https://duckduckgo.com/?q=${encodeURIComponent(query)}\n┃\n`;
      }

      text += `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
      await reply(text);
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('erreur de recherche')} :* _${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
