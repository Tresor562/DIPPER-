/**
 * AI Chat Command - ChatGPT-style responses
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 *
 * ✅ FIX : Remplacé l'API shizo.top (morte/instable) par aiEngine (Pollinations, fiable)
 * ✅ FIX : Ajout cooldown anti-spam
 * ✅ FIX : Formatage visuel cohérent avec le reste du bot
 */

const { askAI, checkCooldown, cooldownMessage, SC } = require('../../utils/aiEngine');
const config = require('../../config.js');

const PFX = config.prefix || '.';
const CD  = 15; // cooldown en secondes

const SYSTEM_ORACLE =
  'Tu es un assistant IA intelligent, utile et bienveillant. ' +
  'Réponds de manière claire, directe et informative. Réponds en français.';

module.exports = {
  name: 'oracle',
  aliases: ['gpt', 'ai', 'chatgpt', 'ask'],
  category: '🤖 IA',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪɴᴠᴏǫᴜᴇ ʟᴀ sᴀɢᴇssᴇ ᴅᴇ ʟ ɪᴀ ᴘᴏᴜʀ ʀᴇᴘᴏɴᴅʀᴇ ᴀ ᴛᴇs ǫᴜᴇsᴛɪᴏɴs',
  usage: `${PFX}oracle <question>`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const chatId = msg.key.remoteJid;
    const { reply, sender, phrases } = extra;

    // Anti-spam cooldown
    const { blocked, remaining } = checkCooldown('oracle', sender, CD);
    if (blocked) return reply(cooldownMessage(remaining, phrases));

    if (args.length === 0) {
      return reply(
        `*⚠️ ${SC('usage')} :* \`${PFX}oracle <${SC('question')}>\`\n\n` +
        `*${SC('exemple')} :* \`${PFX}oracle ${SC('qui est le createur de ghostg-x')} ?\`\n\n` +
        phrases.footer()
      );
    }

    const question = args.join(' ');

    await sock.sendMessage(chatId, {
      react: { text: '🙂‍↔️', key: msg.key }
    }).catch(() => {});

    try {
      // Moteur IA fiable avec cascade automatique si un modèle échoue
      const answer = await askAI(question, SYSTEM_ORACLE, 'openai');

      await reply(
        `╭╼≪• *🤖 ${SC('oracle ia')}* •≫╾╮\n` +
        `┃\n` +
        `┃ ❓ _${question.slice(0, 80)}${question.length > 80 ? '…' : ''}_\n` +
        `┃\n` +
        answer.split('\n').map(l => `┃ ${l}`).join('\n') + '\n' +
        `┃\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        phrases.footer()
      );

      await sock.sendMessage(chatId, {
        react: { text: '✅', key: msg.key }
      }).catch(() => {});

    } catch (error) {
      console.error('Oracle AI error:', error);
      await sock.sendMessage(chatId, {
        react: { text: '❌', key: msg.key }
      }).catch(() => {});
      await reply(
        `*❌ ${SC('loracle a echoue')} :* _${error.message || 'erreur inconnue'}_\n\n${phrases.footer()}`
      );
    }
  }
};
