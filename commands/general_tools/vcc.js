/**
 * VCC Command — 𝐃𝐚𝐫𝐤 Edition  [OWNER ONLY]
 * .vcc [bin] [quantité]
 * Génère des numéros de cartes bancaires fictifs (TEST/DEV uniquement).
 *
 * ⚠️  SÉCURITÉ :
 *   - ownerOnly : accès propriétaire uniquement
 *   - Les numéros générés sont des fakes INVALIDES commercialement
 *     (ils passent l'algorithme de Luhn mais ne correspondent à aucun compte réel)
 *   - USAGE STRICTEMENT LIMITÉ aux tests d'intégration de paiement en dev
 *   - Le bot ajoute un avertissement légal systématique
 *
 * Algorithme de Luhn : vérification mathématique standard des CBs
 * (utilisé par tous les systèmes de paiement pour valider le format)
 */
const config = require('../../config.js');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

/** Identifie le réseau depuis le BIN (6 premiers chiffres) */
function detectNetwork(bin) {
  const b = String(bin);
  if (/^4/.test(b))            return { name: 'Visa',       icon: '💳' };
  if (/^5[1-5]/.test(b))      return { name: 'Mastercard', icon: '🔴' };
  if (/^3[47]/.test(b))       return { name: 'Amex',       icon: '💠' };
  if (/^6(?:011|5)/.test(b))  return { name: 'Discover',   icon: '🟡' };
  if (/^35/.test(b))           return { name: 'JCB',        icon: '🔷' };
  return { name: 'Générique', icon: '💳' };
}

/**
 * Génère un numéro de carte valide (algorithme de Luhn).
 * @param {string} bin — les N premiers chiffres imposés
 * @param {number} length — longueur totale (15 pour Amex, 16 sinon)
 */
function generateCardNumber(bin = '4', length = 16) {
  const prefix = String(bin).replace(/\D/g,'');
  let number   = prefix;

  // Compléter avec des chiffres aléatoires jusqu'à length-1
  while (number.length < length - 1) {
    number += Math.floor(Math.random() * 10);
  }

  // Calcul du chiffre de contrôle (Luhn)
  let sum = 0;
  let alt = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let d = parseInt(number[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return number + checkDigit;
}

/** Formate un numéro de carte en groupes de 4 */
function formatCard(num) {
  return num.match(/.{1,4}/g)?.join(' ') || num;
}

/** Génère une date d'expiration future aléatoire */
function randomExpiry() {
  const now     = new Date();
  const months  = Math.floor(Math.random() * 48) + 12; // 1 à 4 ans
  const exp     = new Date(now.setMonth(now.getMonth() + months));
  const mm      = String(exp.getMonth() + 1).padStart(2,'0');
  const yy      = String(exp.getFullYear()).slice(-2);
  return `${mm}/${yy}`;
}

/** Génère un CVV aléatoire */
function randomCVV(amex = false) {
  const len = amex ? 4 : 3;
  return String(Math.floor(Math.random() * Math.pow(10, len))).padStart(len, '0');
}

module.exports = {
  name:'vcc', aliases:['virtualcard','fakecard','gencard','testcard'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɢᴇ́ɴᴇ̀ʀᴇ ᴅᴇs ᴄᴀʀᴛᴇs ᴛᴇsᴛ ꜰᴀᴋᴇ [👑 ᴏᴡɴᴇʀ]',
  usage:`${config.prefix||'.'}vcc [bin] [quantité]`,
  ownerOnly: true, // ← SÉCURITÉ ABSOLUE

  async execute(sock, msg, args, extra) {
    const { reply, from, isOwner, phrases } = extra;
    try {

    // ── Guard owner strict ────────────────────────────────
    if (!isOwner) {
      return reply(`*🔒 ${SC('commande réservée au propriétaire')}*\n\n${phrases.footer()}`);
    }

    const bin      = args[0] && /^\d+$/.test(args[0]) ? args[0] : '4';
    const count    = Math.min(parseInt(args[1]) || 5, 20); // max 20 cartes
    const { name, icon } = detectNetwork(bin);
    const isAmex   = name === 'Amex';
    const cardLen  = isAmex ? 15 : 16;

    const cards = Array.from({ length: count }, () => {
      const num    = generateCardNumber(bin, cardLen);
      const expiry = randomExpiry();
      const cvv    = randomCVV(isAmex);
      return `${icon} \`${formatCard(num)}\` | ${expiry} | ${cvv}`;
    });

    await reply(
      `╭╼≪• *💳 ${SC('cartes test générées')}* •≫╾╮\n` +
      `┃ 🏦 *${SC('réseau')}* : ${name}\n` +
      `┃ 🔢 *${SC('bin')}* : ${bin}\n` +
      `┃ 📊 *${SC('quantité')}* : ${count}\n` +
      `┃\n` +
      cards.join('\n') + '\n' +
      `┃\n` +
      `┃ ⚠️ *${SC('usage test uniquement')}*\n` +
      `┃ _${SC('ces cartes sont invalides commercialement')}_\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
    );
    } catch (err) {
      console.error('[vcc] Erreur:', err.message);
      try { await reply(`❌ Erreur : ${err.message}`); } catch (_) {}
    }
  }
};
