/**
 * GhostG Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Interrupteur Intelligence Artificielle (NLP mode)
 * FIX: bloc execute dupliqué supprimé
 */

const config   = require('../../config.js');
const database = require('../../database.js');
const prefix   = config.prefix || '.';

module.exports = {
  name   : 'dark',
  aliases: ['intel', 'botai', 'ghostg_mode', 'ghostg'],
  category: '👑 Owner',
  ownerOnly: false,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴄᴛɪᴠᴇ/ᴅᴇ́sᴀᴄᴛɪᴠᴇ ʟ\'ɪɴᴛᴇʟʟɪɢᴇɴᴄᴇ ɴᴀᴛᴜʀᴇʟʟᴇ (NLP)',
  usage: `${prefix}dark on/off`,

  async execute(sock, msg, args, extra) {
    const { reply, react, isOwner, phrases } = extra;
    const firstWord = args && args[0] ? args[0].toLowerCase() : '';

    if (!isOwner) return;

    try {
      // [PHASE 2] Isolé par session — cf. database.js getGhostgMode/setGhostgMode.
      // Avant : lu/écrit dans .env + global.ghostgMode + config.ghostgMode,
      // partagés par TOUT le processus donc par toutes les sessions.
      const isCurrentlyOn = database.getGhostgMode()?.toLowerCase() === 'on';

      if (firstWord === 'on') {
        if (isCurrentlyOn) return reply(`*🧠 ʟᴇ sʏsᴛᴇ̀ᴍᴇ 𝐃𝐈𝐏𝐏𝐄𝐑 ɪɴᴛᴇʟ ᴇsᴛ ᴅᴇ́ᴊᴀ̀ ᴀᴄᴛɪᴠᴇ́.*\n\n${phrases.footer()}`);

        database.setGhostgMode('on');

        await react('🧠');
        return reply(`🟢 *𝐃𝐈𝐏𝐏𝐄𝐑 ɪɴᴛᴇʟ : ᴀᴄᴛɪᴠᴇ́. ᴊᴇ ᴛ'ᴇ́ᴄᴏᴜᴛᴇ ᴅᴇ́sᴏʀᴍᴀɪs.*\n\n${phrases.footer()}`);
      }

      if (firstWord === 'off') {
        if (!isCurrentlyOn) return reply(`*💤 ʟᴇ sʏsᴛᴇ̀ᴍᴇ 𝐃𝐈𝐏𝐏𝐄𝐑 ɪɴᴛᴇʟ ᴇsᴛ ᴅᴇ́ᴊᴀ̀ ᴇɴ ᴠᴇɪʟʟᴇ.*\n\n${phrases.footer()}`);

        database.setGhostgMode('off');

        await react('💤');
        return reply(`💡 *𝐃𝐈𝐏𝐏𝐄𝐑 ɪɴᴛᴇʟ : ᴍɪs ᴇɴ ᴠᴇɪʟʟᴇ.*\n\n${phrases.footer()}`);
      }

      const modeStatus = isCurrentlyOn ? '🟢 ᴏɴ' : '🔴 ᴏғғ';
      return reply(`🤖 *𝐃𝐈𝐏𝐏𝐄𝐑 ᴄᴏɴᴛʀᴏʟ : ${modeStatus}*\n*ᴜsᴀɢᴇ : ${prefix}dark on/off*\n\n${phrases.footer()}`);

    } catch (err) {
      console.error('[dark cmd] error:', err);
      return reply(`*〆 ᴜɴᴇ ᴇʀʀᴇᴜʀ ᴀ ɪɴᴛᴇʀʀᴏᴍᴘᴜ ʟᴀ ᴛʀᴀɴsᴍᴜᴛᴀᴛɪᴏɴ.*\n\n${phrases.footer()}`);
    }
  }
};
