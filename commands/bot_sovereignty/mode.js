const config = require('../../config');
const database = require('../../database');

const prefix = config.prefix || '.';

const normalizeRequestedMode = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (['private', 'priv', 'prive', 'privé'].includes(v)) return 'private';
  if (['public', 'pub', 'publique'].includes(v)) return 'public';
  return null;
};

module.exports = {
  name: 'mode',
  aliases: ['domaine', 'botmode', 'privatemode', 'publicmode', 'ᴅᴏᴍᴀɪɴᴇ'],
  category: '👑 Owner',
  ownerOnly: true,
  description: 'Bascule NexAi WhatsApp entre le mode privé et le mode public',
  usage: `${prefix}mode <prive/public>`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, phrases } = extra;
    if (!isOwner) return;

    try {
      const current = database.getBotAccessMode();
      const requested = normalizeRequestedMode(args?.[0]);

      if (!args?.[0]) {
        const label = current === 'private' ? '🔒 PRIVÉ' : '🌐 PUBLIC';
        const detail = current === 'private'
          ? 'Seuls le propriétaire et les Sudo autorisés peuvent utiliser les commandes.'
          : 'Les commandes publiques sont accessibles à tous; les commandes protégées restent protégées.';

        return reply(
          `*NexAi WhatsApp — Mode d'accès*\n\n` +
          `État actuel : *${label}*\n${detail}\n\n` +
          `• ${prefix}mode prive\n` +
          `• ${prefix}mode public\n\n` +
          phrases.footer()
        );
      }

      if (!requested) {
        return reply(`Mode invalide. Utilise *${prefix}mode prive* ou *${prefix}mode public*.`);
      }

      if (requested === current) {
        return reply(
          requested === 'private'
            ? `🔒 NexAi est déjà en mode privé.\n\n${phrases.footer()}`
            : `🌐 NexAi est déjà en mode public.\n\n${phrases.footer()}`
        );
      }

      database.setBotAccessMode(requested);

      return reply(
        requested === 'private'
          ? `🔒 *NexAi est maintenant en mode privé.*\nLes utilisateurs non autorisés ne peuvent plus utiliser ses commandes.\n\n${phrases.footer()}`
          : `🌐 *NexAi est maintenant en mode public.*\nLes commandes publiques sont ouvertes à tous; Owner/Sudo/Premium/VIP restent protégées selon leurs règles.\n\n${phrases.footer()}`
      );
    } catch (error) {
      console.error('[mode cmd] error:', error);
      return reply(`Impossible de changer le mode de NexAi.\n\n${phrases.footer()}`);
    }
  }
};
