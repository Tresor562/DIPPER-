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

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[command-runtime] ${label}: attendu 1 occurrence, trouvé ${count}`);
  }
  return source.replace(search, replacement);
}

function nodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`[command-runtime] syntaxe invalide ${path.relative(ROOT, file)}: ${result.stderr || result.stdout}`);
  }
}

// ── 1) Sessions appairées : accepter les messages own-device en append ─────
// Le bot principal possède déjà exactement cette politique dans index.js :
// notify pour les messages normaux + append uniquement si msg.key.fromMe.
// Le multi-session doit suivre la même règle, sinon une commande tapée depuis
// le téléphone lié peut être ignorée avant même d'atteindre handler.js.
let sessionSrc = fs.readFileSync(sessionManagerPath, 'utf8');
const APPEND_MARKER = '[SESSION OWN APPEND ROUTING]';

if (!sessionSrc.includes(APPEND_MARKER)) {
  sessionSrc = replaceOnce(
    sessionSrc,
    `  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify') return;`,
    `  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    // ${APPEND_MARKER}\n    // Même politique que la mono-session : les messages normaux arrivent en\n    // notify ; certains messages envoyés depuis le compte connecté arrivent\n    // en append. On n'accepte append QUE pour fromMe afin d'éviter les doublons.\n    if (type !== 'notify' && type !== 'append') return;`,
    'filtre upsert notify/append'
  );

  sessionSrc = replaceOnce(
    sessionSrc,
    `    for (const msg of messages) {\n      if (!msg.message || !msg.key?.id) continue;`,
    `    for (const msg of messages) {\n      if (!msg.message || !msg.key?.id) continue;\n      if (type === 'append' && !msg.key.fromMe) continue;`,
    'append réservé aux messages fromMe'
  );

  fs.writeFileSync(sessionManagerPath, sessionSrc);
  console.log('[command-runtime] routage notify + append(fromMe) installé sur les sessions appairées');
} else {
  console.log('[command-runtime] routage append sessions déjà installé');
}

// ── 2) Accès : supprimer le vieux deuxième filtre « semi-public » ──────────
// checkAccess() est déjà la source de vérité pour owner/sudo/vip/premium/public.
// Après lui, l'ancien bloc exigeait encore premium/vip quand config.public=false
// ET config.selfMode=false. Résultat : des commandes explicitement publiques
// étaient bloquées silencieusement en groupe. SELF_MODE reste intact : en mode
// privé les non-owners sont toujours silencieusement bloqués comme prévu.
let handlerSrc = fs.readFileSync(handlerPath, 'utf8');
const ACCESS_MARKER = '[PUBLIC COMMAND ACCESS FIX]';

if (!handlerSrc.includes(ACCESS_MARKER)) {
  const oldSemiPublicGate = `        // En mode défaut (non public), si pas de niveau d'accès spécifique\n        // et que l'utilisateur n'est ni premium ni vip → bloquer silencieusement\n        if (!config.public && access.reason === null) {\n          const isPublicCmd = !command.premiumOnly && !command.vipOnly &&\n            !command.sudoOnly && !command.ownerOnly &&\n            (!command.accessLevel || command.accessLevel === 'public');\n\n          if (isPublicCmd) {\n            // Commande publique mais bot en mode semi-public\n            // Vérifier que l'utilisateur est premium ou vip\n            const { isPremium, isVip } = require('./utils/accessControl');\n            if (!isPremium(sender) && !isVip(sender)) {\n              console.log(\`[handler] 🔒 Mode défaut — cmd:\${commandName} sender:\${sender} → bloqué\`);\n              return;\n            }\n          }\n        }`;

  const newAccessPolicy = `        // ${ACCESS_MARKER}\n        // checkAccess() vient de valider le niveau réel de la commande. Ne pas\n        // réappliquer ici un second filtre premium/vip aux commandes publiques.\n        // Le mode privé reste géré juste au-dessus par config.selfMode.`;

  handlerSrc = replaceOnce(
    handlerSrc,
    oldSemiPublicGate,
    newAccessPolicy,
    'suppression du filtre semi-public redondant'
  );

  fs.writeFileSync(handlerPath, handlerSrc);
  console.log('[command-runtime] commandes publiques libérées du filtre semi-public redondant');
} else {
  console.log('[command-runtime] accès commandes publiques déjà corrigé');
}

// ── 3) Vérifications de non-régression ─────────────────────────────────────
nodeCheck(sessionManagerPath);
nodeCheck(handlerPath);
nodeCheck(indexPath);

const finalSession = fs.readFileSync(sessionManagerPath, 'utf8');
const finalHandler = fs.readFileSync(handlerPath, 'utf8');
const finalIndex = fs.readFileSync(indexPath, 'utf8');

for (const marker of [
  APPEND_MARKER,
  "type !== 'notify' && type !== 'append'",
  "if (type === 'append' && !msg.key.fromMe) continue;",
]) {
  if (!finalSession.includes(marker)) {
    throw new Error(`[command-runtime] garde-fou session absent: ${marker}`);
  }
}

// Le main owner possédait déjà ce comportement : on refuse de créer une
// divergence future entre mono-session et sessions appairées.
if (!finalIndex.includes("type !== 'notify' && type !== 'append'")) {
  throw new Error('[command-runtime] régression: index.js n’accepte plus append');
}
if (!finalIndex.includes("type === 'append' && !msg.key.fromMe")) {
  throw new Error('[command-runtime] régression: index.js ne protège plus append non-fromMe');
}

for (const marker of [
  ACCESS_MARKER,
  "else if (config.selfMode)",
  'const { checkAccess } = require(\'./utils/accessControl\');',
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

console.log('[command-runtime] ✅ groupes: append owner traité; accès public centralisé; permissions sensibles préservées');
