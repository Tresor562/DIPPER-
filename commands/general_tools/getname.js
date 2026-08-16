'use strict';

const config = require('../../config');
const database = require('../../database');

const prefix = config.prefix || '.';

function cleanJid(jid) {
  return String(jid || '').split(':')[0].replace('@c.us', '@s.whatsapp.net');
}

function numberOf(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function targetFromMessage(msg, args, fallback) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
  if (ctx.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx.quotedMessage && ctx.participant) return ctx.participant;
  const raw = String(args?.[0] || '');
  const num = raw.replace(/\D/g, '');
  if (num.length >= 7) return `${num}@s.whatsapp.net`;
  return fallback;
}

function participantFor(meta, targetJid) {
  if (!meta?.participants?.length || !targetJid) return null;
  const targetNum = numberOf(targetJid);
  return meta.participants.find(p => {
    const ids = [p?.id, p?.phoneNumber, p?.lid, p?.jid, p?.userJid].filter(Boolean);
    return ids.some(id => numberOf(id) === targetNum || cleanJid(id) === cleanJid(targetJid));
  }) || null;
}

module.exports = {
  name: 'getname',
  aliases: ['accountname', 'waname', 'displayname', 'nomcompte'],
  category: '🛠️ Outils généraux',
  description: 'Récupère le nom WhatsApp connu/visible d’un compte.',
  usage: `${prefix}getname [@mention | réponse | numéro]`,

  async execute(sock, msg, args, extra) {
    const { reply, from, sender, groupMetadata, phrases } = extra;
    const targetJid = targetFromMessage(msg, args, sender);
    if (!targetJid) return reply(`⚠️ Utilise ${prefix}getname @personne ou réponds à son message.`);

    const targetNum = numberOf(targetJid);
    let displayName = null;
    let username = null;
    let source = null;

    // Le message courant expose directement le pushName de son expéditeur.
    if (numberOf(sender) === targetNum && msg.pushName) {
      displayName = String(msg.pushName).trim();
      source = 'message WhatsApp';
      try { database.updateUser(targetJid, { displayName, displayNameUpdatedAt: Date.now() }); } catch (_) {}
    }

    // Le handler mémorise le dernier pushName observé pour chaque compte.
    if (!displayName) {
      try {
        const user = database.getUser(targetJid) || {};
        displayName = user.displayName || user.pushName || user.name || null;
        if (displayName) source = 'nom observé par le bot';
      } catch (_) {}
    }

    // Dans les groupes récents, Baileys peut exposer un username WhatsApp.
    let meta = groupMetadata;
    if (from?.endsWith('@g.us') && !meta) {
      try { meta = await sock.groupMetadata(from); } catch (_) {}
    }
    const participant = participantFor(meta, targetJid);
    username = participant?.username || participant?.participantUsername || null;

    // Pour le compte connecté lui-même, Baileys expose parfois sock.user.name.
    if (!displayName && numberOf(sock.user?.id) === targetNum && sock.user?.name) {
      displayName = String(sock.user.name).trim();
      source = 'compte connecté';
    }

    if (!displayName && !username) {
      return reply(
        `👤 *Nom du compte*\n\n` +
        `📞 Numéro : +${targetNum || 'inconnu'}\n` +
        `⚠️ WhatsApp n’expose pas actuellement le nom de ce compte à cette session.\n` +
        `Le bot pourra le mémoriser dès qu’il verra un message de ce compte.\n\n` +
        (phrases?.footer?.() || '')
      );
    }

    const lines = [
      `👤 *Nom du compte WhatsApp*`,
      '',
      `📞 *Numéro :* +${targetNum || 'inconnu'}`,
    ];
    if (displayName) lines.push(`🏷️ *Nom affiché :* ${displayName}`);
    if (username) lines.push(`🪪 *Username WhatsApp :* @${String(username).replace(/^@/, '')}`);
    if (source) lines.push(`🔎 *Source :* ${source}`);
    lines.push('', phrases?.footer?.() || '');

    try {
      return await sock.sendMessage(from, { text: lines.join('\n'), mentions: [targetJid] }, from?.endsWith('@g.us') ? { quoted: msg } : undefined);
    } catch (_) {
      return reply(lines.join('\n'));
    }
  }
};
