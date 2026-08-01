/**
 * Define + Define2 Commands — 𝐃𝐚𝐫𝐤 Edition
 * ─────────────────────────────────────────────
 * .define  → définition via Free Dictionary API (anglais/multilingue)
 * .define2 → définition via Wiktionary REST API (source secondaire)
 *
 * APIs : api.dictionaryapi.dev (gratuit, JSON) + fr.wiktionary.org
 * Cooldown : 10s anti-spam
 */

const axios  = require('axios');
const sessionContext = require('../../utils/sessionContext');
const config = require('../../config.js');

const SC = t => {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

const PFX = config.prefix || '.';
const CAT = '🔍 Recherche';
const CD  = 10;

// Cooldown simple (partagé avec le module)
const cooldowns = new Map();
function checkCD(cmd, jid, secs) {
  const key = sessionContext.scopeKey(`${cmd}:${jid}`), now = Date.now(), last = cooldowns.get(key) || 0;
  if (now - last < secs * 1000) return { blocked: true, remaining: Math.ceil((secs*1000-(now-last))/1000) };
  cooldowns.set(key, now);
  return { blocked: false, remaining: 0 };
}

// ─────────────────────────────────────────────────────────────
// API 1 — Free Dictionary API (anglais + fr/es/de...)
// https://api.dictionaryapi.dev/api/v2/entries/{lang}/{word}
// ─────────────────────────────────────────────────────────────
async function defineWord(word, lang = 'en') {
  const res = await axios.get(
    `https://api.dictionaryapi.dev/api/v2/entries/${lang}/${encodeURIComponent(word)}`,
    { timeout: 10000 }
  );
  const entry   = Array.isArray(res.data) ? res.data[0] : null;
  if (!entry)   throw new Error('Mot introuvable');

  const meanings = entry.meanings?.slice(0, 3) || [];
  const phonetic = entry.phonetics?.find(p => p.text)?.text || '';

  return {
    word     : entry.word,
    phonetic,
    meanings : meanings.map(m => ({
      pos        : m.partOfSpeech,
      definitions: m.definitions?.slice(0, 2).map(d => ({
        def    : d.definition,
        example: d.example || null,
      })) || [],
      synonyms: m.synonyms?.slice(0, 3) || [],
    })),
    source: 'Free Dictionary API',
  };
}

// ─────────────────────────────────────────────────────────────
// API 2 — Wiktionnaire (résumé Wikipedia style)
// ─────────────────────────────────────────────────────────────
async function defineWordWiki(word) {
  // Tentative Wiktionnaire FR
  try {
    const res = await axios.get(
      `https://fr.wiktionary.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`,
      { timeout: 10000 }
    );
    if (res.data?.extract) {
      return {
        word    : res.data.title,
        extract : res.data.extract.slice(0, 500),
        source  : 'Wiktionnaire (fr)',
        url     : res.data.content_urls?.desktop?.page || '',
      };
    }
  } catch (_) {}

  // Fallback : Wikipedia FR résumé
  const res2 = await axios.get(
    `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`,
    { timeout: 10000 }
  );
  if (!res2.data?.extract) throw new Error('Définition introuvable');
  return {
    word   : res2.data.title,
    extract: res2.data.extract.slice(0, 500),
    source : 'Wikipedia (fr)',
    url    : res2.data.content_urls?.desktop?.page || '',
  };
}

module.exports = [

  // ── .define ──────────────────────────────────────────────
  {
    name: 'define', aliases: ['def', 'définir', 'dico', 'dictionary', 'dictionnaire'],
    category: CAT,
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴅᴇ́ꜰɪɴɪᴛɪᴏɴ ᴅ\'ᴜɴ ᴍᴏᴛ 📖',
    usage: `${PFX}define <mot> [langue: fr|en|es]`,

    async execute(sock, msg, args, extra) {
      const { reply, from, sender, phrases } = extra;
      const { blocked, remaining } = checkCD('define', sender, CD);
      if (blocked) return reply(`*⏳ ${SC('cooldown')} : ${remaining}s*\n\n${phrases.footer()}`);

      if (!args.length) {
        return reply(
          `*📌 ${SC('usage')} :* \`${PFX}define <mot>\`\n` +
          `_ᴇx : \`${PFX}define ombre\` | \`${PFX}define shadow en\`_\n\n${phrases.footer()}`
        );
      }

      // Détection de la langue (dernier arg si c'est un code 2-3 lettres)
      let lang = 'fr';
      let word = args.join(' ');
      const lastArg = args[args.length - 1]?.toLowerCase();
      if (['fr','en','es','de','it','pt','ru','ja'].includes(lastArg)) {
        lang = lastArg;
        word = args.slice(0, -1).join(' ');
      }

      await sock.sendMessage(from, { react: { text: '📖', key: msg.key } }).catch(() => {});

      try {
        const d = await defineWord(word, lang);

        let text =
          `╭╼≪• *📖 ${SC('définition')} : ${d.word}* •≫╾╮\n` +
          `┃\n` +
          (d.phonetic ? `┃ 🔊 *${SC('phonétique')}* : ${d.phonetic}\n┃\n` : '');

        for (const m of d.meanings) {
          text += `┃ 📌 *${m.pos}*\n`;
          for (const def of m.definitions) {
            text += `┃ ▸ ${def.def}\n`;
            if (def.example) text += `┃   _"${def.example}"_\n`;
          }
          if (m.synonyms.length) text += `┃ 🔁 ${SC('synonymes')} : ${m.synonyms.join(', ')}\n`;
          text += `┃\n`;
        }

        text +=
          `┃ 🌐 *${SC('source')}* : ${d.source}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;

        await reply(text);
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
      } catch (_) {
        // Fallback : essai en anglais
        try {
          const d2 = await defineWord(word, 'en');
          let text =
            `╭╼≪• *📖 ${SC('définition')} [en] : ${d2.word}* •≫╾╮\n┃\n`;
          for (const m of d2.meanings) {
            text += `┃ 📌 *${m.pos}*\n`;
            for (const def of m.definitions) {
              text += `┃ ▸ ${def.def}\n`;
              if (def.example) text += `┃   _"${def.example}"_\n`;
            }
            text += `┃\n`;
          }
          text += `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;
          await reply(text);
          await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
        } catch (err2) {
          await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
          await reply(`*❌ ${SC('mot introuvable')} : "${word}"*\n_${err2.message}_\n\n${phrases.footer()}`);
        }
      }
    }
  },

  // ── .define2 ──────────────────────────────────────────────
  {
    name: 'define2', aliases: ['def2', 'wiki2', 'wiktionnaire', 'defwiki'],
    category: CAT,
    description: '『 𝐃𝐚ʀᴋ 』➪ ᴅᴇ́ꜰɪɴɪᴛɪᴏɴ ᴠɪᴀ Wiktionnaire/Wikipedia 📚',
    usage: `${PFX}define2 <mot>`,

    async execute(sock, msg, args, extra) {
      const { reply, from, sender, phrases } = extra;
      const { blocked, remaining } = checkCD('define2', sender, CD);
      if (blocked) return reply(`*⏳ ${SC('cooldown')} : ${remaining}s*\n\n${phrases.footer()}`);

      if (!args.length) {
        return reply(`*📌 ${SC('usage')} :* \`${PFX}define2 <mot>\`\n\n${phrases.footer()}`);
      }

      const word = args.join(' ');
      await sock.sendMessage(from, { react: { text: '📚', key: msg.key } }).catch(() => {});

      try {
        const d = await defineWordWiki(word);
        await reply(
          `╭╼≪• *📚 ${SC('encyclopédie')} : ${d.word}* •≫╾╮\n` +
          `┃\n` +
          `┃ _${d.extract}_\n` +
          `┃\n` +
          (d.url ? `┃ 🔗 ${d.url}\n┃\n` : '') +
          `┃ 🌐 *${SC('source')}* : ${d.source}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
      } catch (err) {
        await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
        await reply(`*❌ ${SC('introuvable')} : "${word}"*\n\n${phrases.footer()}`);
      }
    }
  },
];
