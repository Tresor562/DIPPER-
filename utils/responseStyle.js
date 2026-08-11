'use strict';

/**
 * responseStyle.js — garde-fou visuel central THE BIG DIPPER.
 *
 * Une commande fournit son contenu ; le style actif décide de la présentation.
 * Ce module ne touche jamais à la logique métier des commandes.
 */

const PROFILES = {
  0:  { name: 'DIPPER',          mark: '✦',  accent: '⭐', signature: '✦ DIPPER',             wait: 'Traitement en cours...', success: 'Opération réussie.', error: 'Vérifie ta demande.', denied: 'Accès réservé.' },
  1:  { name: 'Dark',            mark: '♰',  accent: '🌑', signature: '♰ DIPPER',             wait: "L'ombre agit...", success: "L'ombre a agi.", error: 'Demande incomplète.', denied: 'Accès réservé.' },
  2:  { name: 'Naruto',          mark: '🍃', accent: '🌀', signature: '🍃 Dattebayo',          wait: 'Jutsu en cours...', success: 'Mission accomplie !', error: 'Argument manquant, dattebayo !', denied: 'Jutsu réservé.' },
  3:  { name: 'Cid',             mark: '◈',  accent: '🕶️', signature: '◈ The Shadow',          wait: "L'ombre agit...", success: 'Mission exécutée.', error: 'Demande incomplète.', denied: 'Accès réservé.' },
  4:  { name: 'Hacker',          mark: '>',  accent: '[ ]', signature: '[ DIPPER ]',          wait: '[ PROCESSING ]', success: '[ OK ]', error: '[ ERROR ]', denied: '[ DENIED ]' },
  5:  { name: 'Manhwa',          mark: '⚔️', accent: '⬆️', signature: '⚔️ LEVEL UP',           wait: 'Activation du skill...', success: 'Skill terminé.', error: 'Paramètre requis.', denied: 'Rang insuffisant.' },
  6:  { name: 'Ai Oshino',       mark: '⭐', accent: '✨', signature: '⭐ DIPPER × Ai',         wait: 'Préparation en cours...', success: "C'est prêt !", error: 'Information manquante.', denied: 'Accès réservé.' },
  7:  { name: 'Ruby Oshino',     mark: '🌸', accent: '💗', signature: '🌸 DIPPER × Ruby',       wait: 'Un instant...', success: "C'est terminé !", error: 'Il manque une information.', denied: 'Accès réservé.' },
  8:  { name: 'Satoru Gojo',     mark: '♾️', accent: '👁️', signature: '♾️ Infinity',           wait: 'Infinity activé...', success: 'Terminé. Trop facile.', error: 'Argument manquant.', denied: 'Accès réservé.' },
  9:  { name: 'Oreki Houtarou',  mark: '·',  accent: '🌿', signature: '· DIPPER',              wait: 'Traitement...', success: "Fait. C'est tout.", error: 'Argument manquant.', denied: 'Pas autorisé.' },
  10: { name: 'Marin Kitagawa',  mark: '🎀', accent: '🌸', signature: '🎀 DIPPER × Marin',      wait: 'Préparation...', success: "Parfait, c'est prêt !", error: 'Il manque quelque chose.', denied: 'Accès réservé.' },
  11: { name: 'Sung Jin-Woo',    mark: '🩸', accent: '🗡️', signature: '🩸 ARISE',              wait: 'Les ombres travaillent...', success: 'Ordre exécuté.', error: 'Argument manquant.', denied: 'Accès réservé.' },
  12: { name: 'Madara Uchiha',   mark: '🌑', accent: '♟️', signature: '🌑 Uchiha',              wait: 'Exécution en cours...', success: 'Exécution accomplie.', error: 'Demande incomplète.', denied: 'Accès refusé.' },
  13: { name: 'Aizen Sosuke',    mark: '🪷', accent: '·',  signature: '🪷 Aizen',               wait: 'Exécution en cours...', success: "Tout s'est déroulé comme prévu.", error: 'Argument manquant.', denied: 'Accès insuffisant.' },
  14: { name: 'Lelouch',         mark: '♔',  accent: '👁️', signature: '♔ ZERO',                wait: "Exécution de l'ordre...", success: 'Ordre exécuté.', error: 'Précision requise.', denied: 'Autorité insuffisante.' },
  15: { name: 'Eren Yeager',     mark: '⚡', accent: '⛓️', signature: "⚡ Continue d'avancer",  wait: 'Avance en cours...', success: 'Terminé.', error: 'Demande incomplète.', denied: 'Accès refusé.' },
  16: { name: 'Itachi Uchiha',   mark: '☾',  accent: '👁️', signature: '☾ Itachi',              wait: 'Mission en cours...', success: 'Mission accomplie.', error: 'Paramètre manquant.', denied: 'Accès refusé.' },
  17: { name: 'Yhwach',          mark: '☩',  accent: '👑', signature: '☩ Almighty',             wait: 'Exécution en cours...', success: 'Décision exécutée.', error: 'Argument manquant.', denied: 'Accès refusé.' },
  18: { name: 'Business Pro',    mark: '•',  accent: '─',  signature: 'DIPPER • Business',     wait: 'Traitement en cours...', success: 'Opération réussie.', error: 'Paramètre requis.', denied: 'Accès non autorisé.' },
  19: { name: 'Shadow Merchant', mark: '🌒', accent: '🕯️', signature: '🌒 Marché nocturne',    wait: 'Transaction en cours...', success: 'Transaction terminée.', error: 'Livraison incomplète.', denied: 'Accès refusé.' },
  20: { name: 'Purgeur Suprême', mark: '🔥', accent: '☄️', signature: '🔥 PURGE COMPLETE',      wait: 'Purification en cours...', success: 'Opération accomplie.', error: 'Demande incomplète.', denied: 'Accès refusé.' },
};

const TYPE_ICONS = {
  info: '', wait: '⏳', success: '✅', warning: '⚠️', error: '❌', denied: '🔒', usage: '', list: '',
};

const BOX_CHARS = /[\u2500-\u257f╼╾≪≫]/g;
const HEAVY_FRAME = /[╭╮╰╯┃║╔╗╚╝╠╣╦╩╬┌┐└┘│]/g;
const PURE_DECORATION = /^[\s*`_~.·•✦★☆♰☩♔◈∞=+\-—–_<>\[\](){}|/\\:;,'"!?⚔️⭐🌑🍃🌀🕶️⬆️✨🌸💗♾️👁️🌿🎀🩸🗡️♟️🪷⚡⛓️☾👑🌒🕯️🔥☄️╭╮╰╯┃║╔╗╚╝╠╣╦╩╬┌┐└┘│─━═╼╾≪≫]+$/u;

function activeStyle(style) {
  if (Number.isInteger(style) && style >= 0 && style <= 20) return style;
  try {
    const manager = require('./styleManager');
    const current = Number(manager.getStyle());
    return Number.isInteger(current) && current >= 0 && current <= 20 ? current : 0;
  } catch (_) {
    return 0;
  }
}

function getProfile(style) {
  return PROFILES[activeStyle(style)] || PROFILES[0];
}

function separatorFor(style) {
  return activeStyle(style) === 4 ? '[------------]' : '────────────';
}

function normalizeLine(line) {
  let out = String(line ?? '');
  out = out.replace(HEAVY_FRAME, ' ');
  out = out.replace(BOX_CHARS, ' ');
  out = out.replace(/^\s*(?:[━═=<>•·*~_\-]+\s*)+/, '');
  out = out.replace(/(?:\s*[━═=<>•·*~_\-]+)+\s*$/, '');
  return out.replace(/[ \t]{2,}/g, ' ').trimEnd();
}

function sanitizeLegacyText(text, style) {
  if (typeof text !== 'string' || !text) return text;
  const sep = separatorFor(style);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let separatorUsed = false;

  for (const original of lines) {
    const trimmed = original.trim();
    const hadFrame = HEAVY_FRAME.test(trimmed) || /[\u2500-\u257f]/u.test(trimmed) || /≪|≫|╼|╾/.test(trimmed);
    HEAVY_FRAME.lastIndex = 0;

    if (trimmed && hadFrame && PURE_DECORATION.test(trimmed)) {
      if (!separatorUsed) {
        out.push(sep);
        separatorUsed = true;
      }
      continue;
    }

    let clean = normalizeLine(original);
    if (hadFrame && !clean.trim()) {
      if (!separatorUsed) {
        out.push(sep);
        separatorUsed = true;
      }
      continue;
    }

    clean = clean.replace(/^\s*[|:]+\s*/, '');
    out.push(clean);
  }

  const compact = [];
  for (const line of out) {
    if (!line.trim() && (!compact.length || !compact[compact.length - 1].trim())) continue;
    compact.push(line);
  }
  while (compact.length && !compact[0].trim()) compact.shift();
  while (compact.length && !compact[compact.length - 1].trim()) compact.pop();
  return compact.join('\n');
}

function inferType(text) {
  const t = String(text || '').toLowerCase();
  if (/❌|erreur|échec|echec|invalid/.test(t)) return 'error';
  if (/🔒|denied|refus|réservé|reserve/.test(t)) return 'denied';
  if (/⚠️|attention|warning/.test(t)) return 'warning';
  if (/⏳|traitement|chargement|en cours|processing/.test(t)) return 'wait';
  if (/✅|succès|succes|réussi|reussi|terminé|termine|completed/.test(t)) return 'success';
  return 'info';
}

function renderResponse({ type = 'info', title = '', body = '', details = '', footer = true, style } = {}) {
  const profile = getProfile(style);
  const icon = TYPE_ICONS[type] || '';
  const headingParts = [profile.mark, icon, String(title || '').trim()].filter(Boolean);
  const lines = [];
  if (headingParts.length) lines.push(headingParts.join(' '));
  if (title) lines.push(separatorFor(style));

  let main = String(body || '').trim();
  if (!main) {
    if (type === 'wait') main = profile.wait;
    else if (type === 'success') main = profile.success;
    else if (type === 'error') main = profile.error;
    else if (type === 'denied') main = profile.denied;
  }
  if (main) lines.push(main);
  if (details) lines.push('', String(details).trim());
  if (footer) lines.push('', profile.signature);
  return sanitizeLegacyText(lines.join('\n'), style);
}

/**
 * Compatibilité avec les commandes existantes qui utilisent extra.phrases.
 * Les clés sont identiques à styleManager.getPhrases(), mais les formulations
 * respectent la palette disciplinée et n'emploient aucun cadre lourd.
 */
function getLegacyPhrases(style) {
  const profile = getProfile(style);
  const line = (text) => `${profile.mark} ${text}`.trim();
  return {
    footer:    () => profile.signature,
    error:     () => line(profile.error),
    wait:      () => line(profile.wait),
    success:   () => line(profile.success),
    denied:    () => line(profile.denied),
    groupOnly: () => line('Commande disponible uniquement en groupe.'),
    adminOnly: () => line('Commande réservée aux administrateurs du groupe.'),
    botAdmin:  () => line('Le bot doit être administrateur pour effectuer cette action.'),
  };
}

function stampCleanedText(text, style) {
  const profile = getProfile(style);
  const lines = String(text || '').split('\n');
  const index = lines.findIndex(line => line.trim() && line.trim() !== separatorFor(style));
  if (index < 0) return text;
  const first = lines[index].trimStart();
  if (!first.startsWith(profile.mark)) lines[index] = `${profile.mark} ${first}`;
  return lines.join('\n');
}

function decoratePayload(payload, style) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.react || payload.delete) return payload;
  let changed = false;
  const next = { ...payload };

  if (typeof next.text === 'string') {
    let cleaned = sanitizeLegacyText(next.text, style);
    if (cleaned !== next.text) cleaned = stampCleanedText(cleaned, style);
    if (cleaned !== next.text) { next.text = cleaned; changed = true; }
  }
  if (typeof next.caption === 'string') {
    let cleaned = sanitizeLegacyText(next.caption, style);
    if (cleaned !== next.caption) cleaned = stampCleanedText(cleaned, style);
    if (cleaned !== next.caption) { next.caption = cleaned; changed = true; }
  }
  return changed ? next : payload;
}

module.exports = {
  PROFILES,
  getProfile,
  separatorFor,
  sanitizeLegacyText,
  inferType,
  renderResponse,
  getLegacyPhrases,
  decoratePayload,
};
