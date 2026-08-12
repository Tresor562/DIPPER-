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
  ping: path.join(ROOT, 'commands', 'general_tools', 'ping.js'),
  repere: path.join(ROOT, 'commands', 'bot_sovereignty', 'repere.js'),
  responseInstaller: path.join(ROOT, 'scripts', 'install-response-style.js'),
  runtimeInstaller: path.join(ROOT, 'scripts', 'install-command-runtime-fixes.js'),
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`[verify-runtime] ${name} absent: ${file}`);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[verify-runtime] syntaxe invalide ${name}: ${check.stderr || check.stdout}`);
}

const handler = fs.readFileSync(files.handler, 'utf8');
const session = fs.readFileSync(files.session, 'utf8');
const index = fs.readFileSync(files.index, 'utf8');
const menu = fs.readFileSync(files.menu, 'utf8');
const ping = fs.readFileSync(files.ping, 'utf8');
const repere = fs.readFileSync(files.repere, 'utf8');

const notifyAppendFilter = /if\s*\(\s*type\s*!==\s*['"]notify['"]\s*&&\s*type\s*!==\s*['"]append['"]\s*\)\s*return\s*;/;
const appendOwnGuard = /if\s*\(\s*type\s*===\s*['"]append['"]\s*&&\s*!msg\.key\.fromMe\s*\)\s*continue\s*;/;
const relayCall = /sock\.relayMessage\s*\(/;
const sendCall = /sock\.sendMessage\s*\(/;

function sliceRegion(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = start < 0 ? -1 : source.indexOf(endNeedle, start);
  if (start < 0 || end < 0 || end <= start) throw new Error(`[verify-runtime] ${label}: région introuvable`);
  return source.slice(start, end);
}

function getAliases(source, label) {
  const exportsPos = source.indexOf('module.exports = {');
  if (exportsPos < 0) throw new Error(`[verify-runtime] module.exports ${label} absent`);
  const aliasesMatch = source.slice(exportsPos).match(/aliases\s*:\s*\[([\s\S]*?)\]/m);
  if (!aliasesMatch) throw new Error(`[verify-runtime] tableau aliases ${label} absent`);
  return aliasesMatch[1];
}

// 1. Watchdog réponses
for (const marker of [
  '[RESPONSE STYLE DISCIPLINE]', '[RELAY RESPONSE WATCH]', '[PENDING RESPONSE WATCH]',
  '[COMMAND RESPONSE WATCHDOG]', 'responseTrace.responses += 1', 'relayTrace.responses += 1',
  'commandResponseTrace.pending > 0', 'Date.now() + 4000',
]) {
  if (!handler.includes(marker)) throw new Error(`[verify-runtime] suivi réponse absent: ${marker}`);
}
if (!handler.includes('!disciplinedPayload.react') || !handler.includes('!disciplinedPayload.delete')) {
  throw new Error('[verify-runtime] exclusion react/delete du watchdog absente');
}
if (!handler.includes('!message.protocolMessage') || !handler.includes('!message.reactionMessage')) {
  throw new Error('[verify-runtime] exclusion relay protocol/reaction absente');
}

// 2. Multi-session
const sessionMessages = sliceRegion(session, '// ─── MESSAGES (handler principal)', '// ─── GROUP UPDATES', 'listener messages session');
if (!notifyAppendFilter.test(sessionMessages)) throw new Error('[verify-runtime] filtre notify/append absent du listener session principal');
if (!appendOwnGuard.test(sessionMessages)) throw new Error('[verify-runtime] protection append non-fromMe absente du listener session principal');
if (!sessionMessages.includes('[SESSION OWN APPEND ROUTING]')) throw new Error('[verify-runtime] marqueur append multi-session absent');
if (!notifyAppendFilter.test(index)) throw new Error('[verify-runtime] filtre notify/append absent du socket principal');
if (!appendOwnGuard.test(index)) throw new Error('[verify-runtime] protection append non-fromMe absente du socket principal');

// 3. Permissions
for (const marker of [
  '[PUBLIC COMMAND ACCESS FIX]', "else if (config.selfMode)", "const { checkAccess } = require('./utils/accessControl');",
  'if (!access.allowed)', 'if (command.ownerOnly && !isMe)', 'if (command.modOnly && !isMod(sender) && !isMe)',
  'if (command.groupOnly && !isGroup)', 'if (command.adminOnly && !isMe',
]) {
  if (!handler.includes(marker)) throw new Error(`[verify-runtime] permission/guard absent: ${marker}`);
}
if (handler.includes('if (!config.public && access.reason === null)')) throw new Error('[verify-runtime] ancien filtre semi-public silencieux encore présent');

// 4. MENU / ALLMENU — le premier chunk doit être enrichi, les suivants standard.
for (const marker of [
  'sendStyledMenuMessage', 'forwardedNewsletterMessageInfo', "name: 'cta_url'", 'getImageBufferForStyle',
]) {
  if (!menu.includes(marker)) throw new Error(`[verify-runtime] menu enrichi incomplet: ${marker}`);
}
if (!relayCall.test(menu)) throw new Error('[verify-runtime] relayMessage menu attendu mais absent');

const menuAliases = getAliases(menu, 'menu');
if (!/['"]menu['"]/.test(menuAliases) || !/['"]allmenu['"]/.test(menuAliases)) {
  throw new Error('[verify-runtime] menu/allmenu ne routent pas vers le même module');
}

const allmenuStart = menu.search(/if\s*\(\s*body\s*===\s*['"]allmenu['"]\s*\)\s*\{/);
const styleMatchPos = allmenuStart < 0 ? -1 : menu.indexOf('const styleMatch = body.match(', allmenuStart);
if (allmenuStart < 0 || styleMatchPos < 0 || styleMatchPos <= allmenuStart) {
  throw new Error('[verify-runtime] branche execute allmenu absente ou non délimitée');
}
const allmenuBlock = menu.slice(allmenuStart, styleMatchPos);
for (const marker of ['buildAllMenuChunks', 'sendStyledMenuMessage(', 'withImage: true', 'await sock.sendMessage(']) {
  if (!allmenuBlock.includes(marker)) throw new Error(`[verify-runtime] allmenu hybride incomplet: ${marker}`);
}

// 5. REPERE / REPÈRE — interactif + newsletter + fallback vraiment indépendant.
if (!/name\s*:\s*['"]repere['"]/.test(repere)) throw new Error('[verify-runtime] commande repere canonique absente');
const repereAliases = getAliases(repere, 'repere');
for (const alias of ['rep', 'repère']) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`['"]${escaped}['"]`).test(repereAliases)) throw new Error(`[verify-runtime] alias ${alias} absent de repere`);
}
if (!/ownerOnly\s*:\s*true/.test(repere)) throw new Error('[verify-runtime] protection ownerOnly de repere absente');
for (const marker of [
  'sendInteractiveRepere', 'forwardedNewsletterMessageInfo', "name: 'cta_url'", 'sendStandardNewsletterFallback',
  'sendHardFallback', 'fallbackText',
]) {
  if (!repere.includes(marker)) throw new Error(`[verify-runtime] repere livraison incomplète: ${marker}`);
}
if (!relayCall.test(repere) || !sendCall.test(repere)) throw new Error('[verify-runtime] repere doit conserver relay + send fallback');

// 6. PING — identité de la session connectée + effet newsletter final.
for (const marker of [
  'function getConnectedPhoneNumber(sock)', 'sock?._sessionPhoneNumber', 'sock?.user?.id',
  'forwardedNewsletterMessageInfo', 'newsletterJid:', 'contextInfo: getNewsletterContext()',
]) {
  if (!ping.includes(marker)) throw new Error(`[verify-runtime] ping session/newsletter incomplet: ${marker}`);
}
const cfgNumberPos = ping.indexOf('config.ownerNumber');
const connectedFnPos = ping.indexOf('function getConnectedPhoneNumber(sock)');
if (cfgNumberPos < connectedFnPos) throw new Error('[verify-runtime] ping utilise config.ownerNumber avant identité socket');

console.log('[verify-runtime] ✅ menu/M enrichi + allmenu hybride + repere triple fallback + ping session/newsletter + sessions/permissions validés');
