'use strict';

const config = require('../../config');
const prefix = config.prefix || '.';

function extractInviteCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
  if (match?.[1]) return match[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;
  return null;
}

module.exports = {
  name: 'groupname',
  aliases: ['gcname', 'getgroupname', 'nomgroupe', 'groupnom'],
  category: '🛠️ Outils généraux',
  description: 'Récupère le nom d’un groupe courant ou depuis un lien d’invitation.',
  usage: `${prefix}groupname [lien WhatsApp | code invitation]`,

  async execute(sock, msg, args, extra) {
    const { reply, from, groupMetadata, phrases } = extra;
    const raw = String(args?.[0] || '').trim();
    let meta = null;
    let source = null;

    try {
      if (!raw) {
        if (!from?.endsWith('@g.us')) {
          return reply(`⚠️ En privé, donne un lien : ${prefix}groupname https://chat.whatsapp.com/...`);
        }
        meta = groupMetadata || await sock.groupMetadata(from);
        source = 'groupe actuel';
      } else {
        const inviteCode = extractInviteCode(raw);
        if (inviteCode) {
          if (typeof sock.groupGetInviteInfo !== 'function') {
            return reply('❌ Cette session ne permet pas de lire les informations d’un lien de groupe.');
          }
          meta = await sock.groupGetInviteInfo(inviteCode);
          source = 'lien d’invitation';
        } else if (raw.endsWith('@g.us')) {
          meta = await sock.groupMetadata(raw);
          source = 'identifiant groupe';
        } else {
          return reply(`⚠️ Donne un lien WhatsApp valide ou utilise la commande directement dans un groupe.`);
        }
      }

      if (!meta?.subject) {
        return reply('❌ Impossible de récupérer le nom de ce groupe. Le lien peut être invalide ou expiré.');
      }

      const count = Number(meta.size || meta.participants?.length || 0);
      const lines = [
        '👥 *Informations du groupe*',
        '',
        `🏷️ *Nom :* ${meta.subject}`,
        meta.id ? `🆔 *ID :* ${meta.id}` : null,
        count ? `👤 *Membres :* ${count}` : null,
        source ? `🔎 *Source :* ${source}` : null,
        meta.desc ? `📝 *Description :* ${String(meta.desc).slice(0, 500)}` : null,
        '',
        phrases?.footer?.() || '',
      ].filter(v => v !== null);

      return reply(lines.join('\n'));
    } catch (err) {
      console.error('[groupname]', err.message);
      return reply('❌ Impossible de récupérer les informations du groupe. Vérifie le lien ou réessaie plus tard.');
    }
  }
};
