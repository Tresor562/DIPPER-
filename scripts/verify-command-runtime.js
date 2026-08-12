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

// 1. Le watchdog doit reconnaître les deux primitives de réponse réellement
// utilisées par les commandes : sendMessage et relayMessage.
for (const marker of [
  '[RESPONSE STYLE DISCIPLINE]',
  '[RELAY RESPONSE WATCH]',
  '[COMMAND RESPONSE WATCHDOG]',
  'responseTrace.responses += 1',
  'relayTrace.responses += 1',
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
// socket principal : notify + append uniquement pour fromMe.
for (const src of [session, index]) {
  if (!src.includes("type !== 'notify' && type !== 'append'")) {
    throw new Error('[verify-runtime] filtre notify/append absent');
  }
  if (!src.includes("type === 'append' && !msg.key.fromMe")) {
    throw new Error('[verify-runtime] protection append non-fromMe absente');
  }
}
if (!session.includes('[SESSION OWN APPEND ROUTING]')) {
  throw new Error('[verify-runtime] marqueur append multi-session absent');
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

console.log('[verify-runtime] ✅ menu/allmenu, relay watchdog, groupes append et permissions validés');
