/**
 * Ban Command - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Condamne et bannit une entité du bot (.env Synced)
 */

const fs   = require('fs');
const path = require('path');
const config = require('../../config');

const prefix = config.prefix || '.';

module.exports = {
  name: 'bannir',
  aliases: ['ban', 'condamner'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʙᴀɴɴɪᴛ ᴜɴ ᴜᴛɪʟɪsᴀᴛᴇᴜʀ ᴅᴜ sʏsᴛᴇ̀ᴍᴇ',
  usage: `${prefix}bannir @user ou en réponse`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isSupremeOwner: isSuperMe, toSmallCaps } = extra;
    const chatId = msg.key.remoteJid;

    try {
      // Seuls owners et supreme owners ont accès — silence total pour les autres
      if (!isOwner && !isSuperMe) return;

      // Supreme owners définis (pour protection anti-suicide) — uniquement
      // depuis la configuration officielle, aucun numéro codé en dur
      const supremeNumbers = (config.supremeOwners || [])
        .map(n => String(n).replace(/\D/g, ''));

      let target;
      const ctx      = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned.length > 0) {
        target = mentioned[0];
      } else if (ctx?.quotedMessage) {
        target = ctx.participant;
        if (!target) return reply(`*〆 ${toSmallCaps('impossible de cibler cette ame')}.*`);
      } else {
        return reply(
          `*〆 ${toSmallCaps('invoque une mention ou reponds a une ame pour la bannir')} !*\n` +
          `*${toSmallCaps('usage')} : \`${prefix}bannir @user\`*\n\n${extra.phrases.footer()}`
        );
      }

      const cleanTarget = target.split('@')[0].split(':')[0].replace(/\D/g, '');

      // Empêcher de bannir un supreme owner
      if (supremeNumbers.includes(cleanTarget)) {
        return reply(`*🛡️ ${toSmallCaps('tu ne peux pas condamner un maitre supreme du sanctuaire')} !*`);
      }

      // Lecture/mise à jour du .env
      const envPath = path.join(process.cwd(), '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

      let bannedList = [];
      const bannedMatch = envContent.match(/^BANNED_USERS=(.*)$/m);
      if (bannedMatch) {
        bannedList = bannedMatch[1].split(',').map(n => n.trim()).filter(Boolean);
      }

      if (bannedList.includes(cleanTarget)) {
        return reply(`*💀 ${toSmallCaps('cette ame est deja bannie du sanctuaire')}.*`);
      }

      bannedList.push(cleanTarget);
      const newBannedString = bannedList.join(',');

      if (envContent.match(/^BANNED_USERS=/m)) {
        envContent = envContent.replace(/^BANNED_USERS=.*/m, `BANNED_USERS=${newBannedString}`);
      } else {
        envContent = envContent.trim() + `\nBANNED_USERS=${newBannedString}`;
      }

      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

      // Application immédiate en mémoire
      process.env.BANNED_USERS = newBannedString;

      await sock.sendMessage(chatId, {
        text:
          `*🔒 ʟ\'ᴀ̂ᴍᴇ ᴅᴇ @${cleanTarget} ᴀ ᴇ́ᴛᴇ́ ʙᴀɴɴɪᴇ ᴇᴛ sᴄᴇʟʟᴇ́ᴇ ᴅᴀɴs ʟᴇ ɴᴇ́ᴀɴᴛ !*\n\n` +
          extra.phrases.footer(),
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      console.error('[bannir] error:', error);
      await reply(`*〆 ${toSmallCaps('le rituel de bannissement a echoue')} : ${error.message}*`);
    }
  }
};
