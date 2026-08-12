'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const sessionManagerPath = path.join(ROOT, 'utils', 'sessionManager.js');
const indexPath = path.join(ROOT, 'index.js');

for (const file of [handlerPath, sessionManagerPath, indexPath]) {
  if (!fs.existsSync(file)) throw new Error(`[command-runtime] fichier absent: ${file}`);
}

function nodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`[command-runtime] syntaxe invalide ${path.relative(ROOT, file)}: ${result.stderr || result.stdout}`);
  }
}

function sliceRegion(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = start < 0 ? -1 : source.indexOf(endNeedle, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`[command-runtime] ${label}: région introuvable`);
  }
  return { start, end, text: source.slice(start, end) };
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const notifyAppendFilter = /if\s*\(\s*type\s*!==\s*['"]notify['"]\s*&&\s*type\s*!==\s*['"]append['"]\s*\)\s*return\s*;/;
const notifyOnlyFilter = /if\s*\(\s*type\s*!==\s*['"]notify['"]\s*\)\s*return\s*;/;
const appendOwnGuard = /if\s*\(\s*type\s*===\s*['"]append['"]\s*&&\s*!msg\.key\.fromMe\s*\)\s*continue\s*;/;
const validMessageGuard = /if\s*\(\s*!msg\.message\s*\|\|\s*!msg\.key\?\.id\s*\)\s*continue\s*;/;

// ── 1) Sessions appairées : accepter les messages own-device en append ─────
// Important : plusieurs patches Render s'exécutent AVANT cet installateur.
// On ne dépend donc plus d'une mise en forme exacte de sessionManager.js : on
// isole le listener MESSAGES principal et on vérifie/complète sa logique.
let sessionSrc = fs.readFileSync(sessionManagerPath, 'utf8');
const APPEND_MARKER = '[SESSION OWN APPEND ROUTING]';
const SESSION_START = '// ─── MESSAGES (handler principal)';
const SESSION_END = '// ─── GROUP UPDATES';

let region = sliceRegion(sessionSrc, SESSION_START, SESSION_END, 'listener messages principal');
let messageBlock = region.text;

if (!notifyAppendFilter.test(messageBlock)) {
  const matches = messageBlock.match(new RegExp(notifyOnlyFilter.source, 'g')) || [];
  if (matches.length !== 1) {
    throw new Error(`[command-runtime] filtre notify du listener principal: attendu 1 occurrence, trouvé ${matches.length}`);
  }
  messageBlock = messageBlock.replace(
    notifyOnlyFilter,
    "if (type !== 'notify' && type !== 'append') return;"
  );
}

if (!appendOwnGuard.test(messageBlock)) {
  const matches = messageBlock.match(new RegExp(validMessageGuard.source, 'g')) || [];
  if (matches.length !== 1) {
    throw new Error(`[command-runtime] garde message valide du listener principal: attendu 1 occurrence, trouvé ${matches.length}`);
  }
  messageBlock = messageBlock.replace(
    validMessageGuard,
    match => `${match}\n      if (type === 'append' && !msg.key.fromMe) continue;`
  );
}

if (!messageBlock.includes(APPEND_MARKER)) {
  const listenerLine = /sock\.ev\.on\(['"]messages\.upsert['"],\s*async\s*\(\{\s*messages\s*,\s*type\s*\}\)\s*=>\s*\{/;
  if (!listenerLine.test(messageBlock)) {
    throw new Error('[command-runtime] listener messages.upsert principal introuvable');
  }
  messageBlock = messageBlock.replace(
    listenerLine,
    match => `${match}\n    // ${APPEND_MARKER}`
  );
}

sessionSrc = sessionSrc.slice(0, region.start) + messageBlock + sessionSrc.slice(region.end);
fs.writeFileSync(sessionManagerPath, sessionSrc);
console.log('[command-runtime] routage notify + append(fromMe) validé sur les sessions appairées');

// ── 2) Accès : supprimer le vieux deuxième filtre « semi-public » ──────────
// checkAccess() reste la source de vérité pour owner/sudo/vip/premium/public.
// Le correctif est idempotent : si un patch précédent a déjà supprimé le gate,
// on ne considère pas cela comme une erreur de build.
let handlerSrc = fs.readFileSync(handlerPath, 'utf8');
const ACCESS_MARKER = '[PUBLIC COMMAND ACCESS FIX]';
const gateNeedle = 'if (!config.public && access.reason === null) {';
const gatePos = handlerSrc.indexOf(gateNeedle);

if (gatePos >= 0) {
  const openBrace = handlerSrc.indexOf('{', gatePos);
  const closeBrace = findMatchingBrace(handlerSrc, openBrace);
  if (openBrace < 0 || closeBrace < 0) {
    throw new Error('[command-runtime] filtre semi-public trouvé mais bloc non refermable');
  }

  const commentNeedle = '// En mode défaut (non public), si pas de niveau d\'accès spécifique';
  const commentPos = handlerSrc.lastIndexOf(commentNeedle, gatePos);
  const removeStart = commentPos >= 0 && gatePos - commentPos < 500 ? commentPos : gatePos;
  const replacement =
    `// ${ACCESS_MARKER}\n` +
    `        // checkAccess() vient de valider le niveau réel de la commande.\n` +
    `        // Aucun second filtre premium/vip n'est appliqué aux commandes publiques.`;

  handlerSrc = handlerSrc.slice(0, removeStart) + replacement + handlerSrc.slice(closeBrace + 1);
  console.log('[command-runtime] filtre semi-public redondant supprimé');
} else if (!handlerSrc.includes(ACCESS_MARKER)) {
  const guardsAnchor = '    // ── GUARDS COMMANDES';
  const pos = handlerSrc.indexOf(guardsAnchor);
  if (pos < 0) throw new Error('[command-runtime] point de contrôle des permissions introuvable');
  handlerSrc = handlerSrc.slice(0, pos) +
    `    // ${ACCESS_MARKER}\n` +
    `    // checkAccess() est l'unique source de vérité pour l'accès public/premium/vip/sudo.\n` +
    handlerSrc.slice(pos);
  console.log('[command-runtime] filtre semi-public déjà absent — état accepté');
} else {
  console.log('[command-runtime] accès commandes publiques déjà corrigé');
}

fs.writeFileSync(handlerPath, handlerSrc);

// ── 3) Vérifications de non-régression ─────────────────────────────────────
nodeCheck(sessionManagerPath);
nodeCheck(handlerPath);
nodeCheck(indexPath);

const finalSession = fs.readFileSync(sessionManagerPath, 'utf8');
const finalHandler = fs.readFileSync(handlerPath, 'utf8');
const finalIndex = fs.readFileSync(indexPath, 'utf8');
const finalRegion = sliceRegion(finalSession, SESSION_START, SESSION_END, 'listener messages final').text;

if (!notifyAppendFilter.test(finalRegion)) {
  throw new Error('[command-runtime] garde-fou session absent: notify + append');
}
if (!appendOwnGuard.test(finalRegion)) {
  throw new Error('[command-runtime] garde-fou session absent: append réservé à fromMe');
}
if (!finalRegion.includes(APPEND_MARKER)) {
  throw new Error(`[command-runtime] garde-fou session absent: ${APPEND_MARKER}`);
}

// Le main owner possède déjà ce comportement : on refuse toute divergence
// entre mono-session et sessions appairées, sans dépendre des espaces/guillemets.
if (!notifyAppendFilter.test(finalIndex)) {
  throw new Error('[command-runtime] régression: index.js n’accepte plus append');
}
if (!appendOwnGuard.test(finalIndex)) {
  throw new Error('[command-runtime] régression: index.js ne protège plus append non-fromMe');
}

for (const marker of [
  ACCESS_MARKER,
  "else if (config.selfMode)",
  "const { checkAccess } = require('./utils/accessControl');",
  'if (!access.allowed)',
  'if (command.ownerOnly && !isMe)',
  'if (command.modOnly && !isMod(sender) && !isMe)',
]) {
  if (!finalHandler.includes(marker)) {
    throw new Error(`[command-runtime] garde-fou accès absent: ${marker}`);
  }
}

if (finalHandler.includes('if (!config.public && access.reason === null)')) {
  throw new Error('[command-runtime] ancien filtre semi-public silencieux encore présent');
}

console.log('[command-runtime] ✅ patch-order résilient; groupes append et permissions sensibles validés');
