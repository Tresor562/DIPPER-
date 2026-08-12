'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const files = {
  handler: path.join(ROOT, 'handler.js'),
  session: path.join(ROOT, 'utils', 'sessionManager.js'),
  index: path.join(ROOT, 'index.js'),
  menu: path.join(ROOT, 'commands', 'general_tools', 'menu.js'),
  responseInstaller: path.join(ROOT, 'scripts', 'install-response-style.js'),
  runtimeInstaller: path.join(ROOT, 'scripts', 'install-command-runtime-fixes.js'),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`[verify-runtime] ${name} absent: ${file}`);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[verify-runtime] syntaxe invalide ${name}: ${check.stderr || check.stdout}`);
  }
}

const handler = fs.readFileSync(files.handler, 'utf8');
const session = fs.readFileSync(files.session, 'utf8');
const index = fs.readFileSync(files.index, 'utf8');
const menu = fs.readFileSync(files.menu, 'utf8');

const notifyAppendFilter = /if\s*\(\s*type\s*!==\s*['"]notify['"]\s*&&\s*type\s*!==\s*['"]append['"]\s*\)\s*return\s*;/;
const appendOwnGuard = /if\s*\(\s*type\s*===\s*['"]append['"]\s*&&\s*!msg\.key\.fromMe\s*\)\s*continue\s*;/;

function sliceRegion(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = start < 0 ? -1 : source.indexOf(endNeedle, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`[verify-runtime] ${label}: région introuvable`);
  }
  return source.slice(start, end);
}

// 1. Le watchdog doit reconnaître les deux primitives de réponse réellement
// utilisées par les commandes : sendMessage et relayMessage, y compris les
// anciennes commandes qui ne font pas await sur leur envoi.
for (const marker of [
  '[RESPONSE STYLE DISCIPLINE]',
  '[RELAY RESPONSE WATCH]',
  '[PENDING RESPONSE WATCH]',
  '[COMMAND RESPONSE WATCHDOG]',
  'responseTrace.responses += 1',
  'relayTrace.responses += 1',
  'commandResponseTrace.pending > 0',
  'Date.now() + 4000',
]) {
  if (!handler.includes(marker)) throw new Error(`[verify-runtime] suivi réponse absent: ${marker}`);
}

// Une réaction ou suppression seule ne doit toujours pas être prise pour une
// réponse visible de commande.
if (!handler.includes('!disciplinedPayload.react') || !handler.includes('!disciplinedPayload.delete')) {
  throw new Error('[verify-runtime] exclusion react/delete du watchdog absente');
}
if (!handler.includes('!message.protocolMessage') || !handler.includes('!message.reactionMessage')) {
  throw new Error('[verify-runtime] exclusion relay protocol/reaction absente');
}

// 2. Les sessions appairées doivent avoir la même politique upsert que le
// socket principal : notify + append uniquement pour fromMe. On vérifie la
// structure, pas la mise en forme exacte produite par les patches précédents.
const sessionMessages = sliceRegion(
  session,
  '// ─── MESSAGES (handler principal)',
  '// ─── GROUP UPDATES',
  'listener messages session'
);

if (!notifyAppendFilter.test(sessionMessages)) {
  throw new Error('[verify-runtime] filtre notify/append absent du listener session principal');
}
if (!appendOwnGuard.test(sessionMessages)) {
  throw new Error('[verify-runtime] protection append non-fromMe absente du listener session principal');
}
if (!sessionMessages.includes('[SESSION OWN APPEND ROUTING]')) {
  throw new Error('[verify-runtime] marqueur append multi-session absent');
}
if (!notifyAppendFilter.test(index)) {
  throw new Error('[verify-runtime] filtre notify/append absent du socket principal');
}
if (!appendOwnGuard.test(index)) {
  throw new Error('[verify-runtime] protection append non-fromMe absente du socket principal');
}

// 3. checkAccess reste la source de vérité. Le vieux deuxième filtre public
// qui bloquait silencieusement les utilisateurs normaux doit avoir disparu.
for (const marker of [
  '[PUBLIC COMMAND ACCESS FIX]',
  "else if (config.selfMode)",
  "const { checkAccess } = require('./utils/accessControl');",
  'if (!access.allowed)',
  'if (command.ownerOnly && !isMe)',
  'if (command.modOnly && !isMod(sender) && !isMe)',
  'if (command.groupOnly && !isGroup)',
  'if (command.adminOnly && !isMe',
]) {
  if (!handler.includes(marker)) throw new Error(`[verify-runtime] permission/guard absent: ${marker}`);
}
if (handler.includes('if (!config.public && access.reason === null)')) {
  throw new Error('[verify-runtime] ancien filtre semi-public silencieux encore présent');
}

// 4. Le menu utilise volontairement relayMessage pour l'interactif : cette
// primitive doit donc être couverte par le watchdog ci-dessus.
if (!menu.includes('sendStyledMenuMessage')) {
  throw new Error('[verify-runtime] expéditeur menu unifié absent');
}
if (!menu.includes('sock.relayMessage')) {
  throw new Error('[verify-runtime] relayMessage menu attendu mais absent');
}

// menu et allmenu doivent router vers le même module de commande.
const exportsPos = menu.indexOf('module.exports = {');
if (exportsPos < 0) throw new Error('[verify-runtime] module.exports menu absent');
const aliasesMatch = menu.slice(exportsPos).match(/aliases\s*:\s*\[([\s\S]*?)\]/m);
if (!aliasesMatch) throw new Error('[verify-runtime] tableau aliases menu absent');
const aliasBody = aliasesMatch[1];
if (!/['"]menu['"]/.test(aliasBody) || !/['"]allmenu['"]/.test(aliasBody)) {
  throw new Error('[verify-runtime] menu/allmenu ne routent pas vers le même module');
}

console.log('[verify-runtime] ✅ vérification structurelle: menu/allmenu, pending/relay, append(fromMe) et permissions validés');
