/**
 * SelfAdmin Command - Promote the command sender to group admin
 * THE BIG DIPPER
 */

const { findParticipant } = require('../../utils/jidHelpers');
const config = require('../../config.js');

const prefix = config.prefix || '.';

module.exports = {
  name: 'selfadmin',
  aliases: ['adminme', 'makeadminme', 'autoadmin'],
  category: '🛡️ Protections',
  description: 'Se promouvoir soi-même administrateur du groupe',
  usage: `${prefix}selfadmin`,
  groupOnly: true,
  adminOnly: false,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    const { reply, sender } = extra;
    const chatId = msg.key.remoteJid;
    const target = sender || msg.key.participant;

    try {
      if (!target) {
        return reply('❌ Impossible d’identifier ton compte WhatsApp.');
      }

      // WhatsApp n’autorise une promotion que si le bot est lui-même admin.
      const metadata = await sock.groupMetadata(chatId);
      const participant = findParticipant(metadata.participants, target);

      if (!participant) {
        return reply('❌ Ton compte n’a pas été trouvé parmi les membres du groupe.');
      }

      if (participant.admin === 'admin' || participant.admin === 'superadmin') {
        return reply('✅ Tu es déjà administrateur de ce groupe.');
      }

      await sock.groupParticipantsUpdate(chatId, [target], 'promote');

      await sock.sendMessage(chatId, {
        text: `👑 @${target.split('@')[0]} s’est proclamé administrateur du groupe.`,
        mentions: [target]
      }, { quoted: msg });
    } catch (error) {
      console.error('SelfAdmin Command Error:', error);
      return reply(`❌ Promotion impossible : ${error.message}`);
    }
  }
};
