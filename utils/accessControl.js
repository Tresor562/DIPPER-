/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         𝐃𝐚𝐫𝐤 — Système Centralisé de Permissions          ║
 * ║  Fichier : utils/accessControl.js                           ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                             ║
 * ║  Niveaux d'accès (du plus bas au plus haut) :              ║
 * ║                                                             ║
 * ║  public       → tout le monde (si PUBLIC_MODE=true)        ║
 * ║  premium      → membres premium (isPremium = true)         ║
 * ║  vip          → membres VIP (isVip = true)                 ║
 * ║  sudo         → administrateurs délégués (isSudo = true)   ║
 * ║  owner        → propriétaire du bot (isOwner = true)       ║
 * ║  supremeOwner → propriétaire suprême (isSuperMe = true)    ║
 * ║                                                             ║
 * ║  Règle de hiérarchie :                                     ║
 * ║  supremeOwner > owner > sudo > vip > premium > public      ║
 * ║                                                             ║
 * ║  Un niveau supérieur inclut toujours les niveaux inf.      ║
 * ║  Ex : owner peut utiliser les commandes premium et vip.    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const { isPremium } = require('./premiumDB');
const { isVip }     = require('./vipDB');

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGES DE REFUS CENTRALISÉS
// ─────────────────────────────────────────────────────────────────────────────

function toSC(t) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

/**
 * Message de refus pour les commandes PREMIUM
 */
function premiumDeniedMessage(commandName) {
  return (
    `╭━━━〔 💎 ${toSC('acces premium requis')} 💎 〕━━━╮\n` +
    `┃\n` +
    `┃ 🔒 *${commandName ? toSC(commandName) : toSC('cette commande')}*\n` +
    `┃    ${toSC('est reservee aux membres premium')}.\n` +
    `┃\n` +
    `┃ 💬 ${toSC('pour obtenir lacces contacte')}\n` +
    `┃    ${toSC('le supreme owner')}.\n` +
    `┃\n` +
    `┃ ✨ ${toSC('debloque plus de fonctionnalites')}.\n` +
    `┃ 🚀 ${toSC('profite de toute la puissance du bot')}.\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `> _${toSC('contacte le supreme owner pour lactivation')}_`
  );
}

/**
 * Message de refus pour les commandes VIP
 */
function vipDeniedMessage(commandName) {
  return (
    `╭━━━〔 👑 ${toSC('acces vip requis')} 👑 〕━━━╮\n` +
    `┃\n` +
    `┃ 👑 *${commandName ? toSC(commandName) : toSC('cette commande')}*\n` +
    `┃    ${toSC('est reservee aux membres vip')}.\n` +
    `┃\n` +
    `┃ 💎 ${toSC('lacces vip debloque des')}\n` +
    `┃    ${toSC('fonctionnalites exclusives du bot')}.\n` +
    `┃\n` +
    `┃ 💬 ${toSC('contacte le supreme owner')}\n` +
    `┃    ${toSC('pour obtenir lacces')}.\n` +
    `┃\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `> _${toSC('acces vip — sur invitation du supreme owner')}_`
  );
}

/**
 * Message de refus pour les commandes SUDO
 */
function sudoDeniedMessage() {
  return (
    `*❌ ${toSC('acces refuse')}*\n\n` +
    `_${toSC('cette commande est reservee aux administrateurs autorises par le supreme owner')}._`
  );
}

/**
 * Message de refus pour les commandes OWNER ONLY
 */
function ownerDeniedMessage() {
  return (
    `*⛔ ${toSC('commande reservee au proprietaire du bot')}*`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VÉRIFICATION D'ACCÈS CENTRALISÉE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkAccess — vérifie si un utilisateur peut utiliser une commande.
 *
 * @param {object} params
 * @param {string}  params.sender       — JID de l'utilisateur
 * @param {boolean} params.isMe         — est-il owner/supremeOwner ?
 * @param {boolean} params.isSuperMe    — est-il supremeOwner ?
 * @param {boolean} params.isSudo       — est-il sudo ?
 * @param {object}  params.command      — objet commande (name, accessLevel, premiumOnly, vipOnly...)
 *
 * @returns {{ allowed: boolean, reason: string|null, message: string|null }}
 *   allowed : true si accès autorisé
 *   reason  : 'premium' | 'vip' | 'sudo' | 'owner' | 'denied' | null
 *   message : le message de refus à envoyer, ou null si autorisé
 */
function checkAccess({ sender, isMe, isSuperMe, isSudo, command }) {
  const name        = command.name || '';
  const accessLevel = command.accessLevel || 'public';
  const premiumOnly = command.premiumOnly === true;
  const vipOnly     = command.vipOnly     === true;
  const sudoOnly    = command.sudoOnly    === true;

  // Niveau suprême — toujours autorisé
  if (isMe) return { allowed: true, reason: null, message: null };

  // Commande ownerOnly — seul l'owner peut
  if (command.ownerOnly) {
    return { allowed: false, reason: 'owner', message: ownerDeniedMessage() };
  }

  // Commande sudoOnly ou accessLevel=sudo
  if (sudoOnly || accessLevel === 'sudo') {
    if (!isSudo) {
      return { allowed: false, reason: 'sudo', message: sudoDeniedMessage() };
    }
    return { allowed: true, reason: null, message: null };
  }

  // Sudo est autorisé à tout ce qui n'est pas ownerOnly
  if (isSudo) return { allowed: true, reason: null, message: null };

  // Commande VIP
  if (vipOnly || accessLevel === 'vip') {
    if (!isVip(sender)) {
      return { allowed: false, reason: 'vip', message: vipDeniedMessage(name) };
    }
    return { allowed: true, reason: null, message: null };
  }

  // Commande Premium (VIP inclus — vip >= premium)
  if (premiumOnly || accessLevel === 'premium') {
    if (!isPremium(sender) && !isVip(sender)) {
      return { allowed: false, reason: 'premium', message: premiumDeniedMessage(name) };
    }
    return { allowed: true, reason: null, message: null };
  }

  // Accès public — autorisé
  return { allowed: true, reason: null, message: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  checkAccess,
  premiumDeniedMessage,
  vipDeniedMessage,
  sudoDeniedMessage,
  ownerDeniedMessage,
  isPremium,
  isVip,
};
