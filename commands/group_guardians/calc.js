/**
 * Calculator Command - Perform math calculations
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 */

const config = require('../../config.js');

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

const prefix = config.prefix || '.';

module.exports = {
  name: 'algebre',
  aliases: [ 'calc', 'calculate', 'calcul', 'math'],
  category: '🛠️ Outils généraux',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇsᴏᴜᴛ ᴅᴇs ᴀʀᴄᴀɴᴇs ᴇᴛ ᴇxᴘʀᴇssɪᴏɴs ᴍᴀᴛʜᴇᴍᴀᴛɪǫᴜᴇs',
  usage: `${prefix}algebre <expression>`,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;

    try {
      if (args.length === 0) {
        return reply(`*⚠️ ${toSmallCaps('usage')} :* \`${prefix}algebre <${toSmallCaps('expression')}>\`\n\n*${toSmallCaps('exemple')} :* \`${prefix}algebre 5 + 3 * 2\`\n\n${extra.phrases.footer()}`);
      }

      const expression = args.join(' ');

      // Basic safety check
      if (!/^[0-9+\-*/(). ]+$/.test(expression)) {
        return reply(`*❌ ${toSmallCaps('expression invalide')} ! ${toSmallCaps('seuls les chiffres et les operateurs')} (+, -, *, /, ()) ${toSmallCaps('sont autorises')}.*\n\n${extra.phrases.footer()}`);
      }

      try {
        // eslint-disable-next-line no-eval
        const result = eval(expression);

        let text = `*╭━≪• ᴀʀᴄᴀɴᴇs ᴍᴀᴛʜᴇ́ᴍᴀᴛɪǫᴜᴇs •≫╾╮*\n`;
        text += `*┃ 📝 ᴇxᴘʀᴇssɪᴏɴ : ${expression}*\n`;
        text += `*┃ ✅ ʀᴇsᴜʟᴛᴀᴛ : ${result}*\n`;
        text += `*╰━━━━━━━━━━━━━━━╯*\n\n`;
        text += extra.phrases.footer();

        await reply(text);

      } catch (evalError) {
        await reply(`*❌ ${toSmallCaps('l expression mathematique est incoherente')} !*\n\n${extra.phrases.footer()}`);
      }

    } catch (error) {
      console.error('Algebre command error:', error);
      await reply(`*❌ ${toSmallCaps('l\'invocation a echoue')} : ${error.message}*\n\n${extra.phrases.footer()}`);
    }
  }
};
