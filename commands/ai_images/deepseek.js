/**
 * DeepSeek Command — 𝐃𝐚𝐫𝐤 Edition
 * .deepseek <question>
 * IA de raisonnement approfondi (DeepSeek-R1 via Pollinations AI)
 * Idéal pour : maths, logique, analyse, raisonnement pas-à-pas
 * Cooldown : 20s (modèle lent mais puissant)
 */
const { checkCooldown, cooldownMessage, callDeepSeek, SC } = require('../../utils/aiEngine');
const config = require('../../config.js');
const PFX = config.prefix || '.';
const CAT = '🤖 IA';

const SYSTEM_DEEPSEEK =
  'Tu es une IA de raisonnement avancé. Pour chaque question, raisonne étape par étape ' +
  'avant de donner ta conclusion finale. Sois précis, rigoureux et pédagogue. ' +
  'Structure ta réponse avec des étapes numérotées si le problème le nécessite. Réponds en français.';

module.exports = {
  name: 'deepseek', aliases: ['ds', 'raisonnement', 'reason', 'think'],
  category: CAT,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪᴀ ᴅᴇ ʀᴀɪsᴏɴɴᴇᴍᴇɴᴛ ᴀᴘᴘʀᴏꜰᴏɴᴅɪ 🧠',
  usage: `${PFX}deepseek <question complexe>`,

  async execute(sock, msg, args, extra) {
    const { reply, from, sender, phrases } = extra;
    const { blocked, remaining } = checkCooldown('deepseek', sender, 20);
    if (blocked) return reply(cooldownMessage(remaining, phrases));

    if (!args.length) {
      return reply(
        `*📌 ${SC('usage')} :* \`${PFX}deepseek <question>\`\n` +
        `_${SC('idéal pour les maths, la logique et lanalyse')}_\n\n${phrases.footer()}`
      );
    }

    const question = args.join(' ');
    await sock.sendMessage(from, { react: { text: '🧠', key: msg.key } }).catch(() => {});
    await reply(`*🧠 ${SC('analyse en cours')}...*\n_${SC('le raisonnement prend quelques secondes')}_`);

    try {
      const answer = await callDeepSeek(question, SYSTEM_DEEPSEEK);

      await sock.sendMessage(from, {
        text:
          `╭╼≪• *🧠 DeepSeek ᴿ¹* •≫╾╮\n` +
          `┃\n` +
          `┃ ❓ _${question.slice(0, 80)}${question.length > 80 ? '…' : ''}_\n` +
          `┃\n` +
          answer.split('\n').map(l => `┃ ${l}`).join('\n') + '\n' +
          `┃\n` +
          `┃ 🤖 _${SC('deepseek-r1 via pollinations')}_\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(() => {});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(() => {});
      await reply(`*❌ ${SC('erreur deepseek')} :* _${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
