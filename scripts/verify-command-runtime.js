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
const welcomePath = path.join(ROOT, 'utils', 'welcomeCard.js');

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`[verify-runtime] ${name} absent: ${file}`);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[verify-runtime] syntaxe invalide ${name}: ${check.stderr || check.stdout}`);
}
if (fs.existsSync(welcomePath)) {
  const check = spawnSync(process.execPath, ['--check', welcomePath], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[verify-runtime] syntaxe invalide welcomeCard: ${check.stderr || check.stdout}`);
}

const handler = fs.readFileSync(files.handler, 'utf8');
const session = fs.readFileSync(files.session, 'utf8');
const index = fs.readFileSync(files.index, 'utf8');
const menu = fs.readFileSync(files.menu, 'utf8');
const ping = fs.readFileSync(files.ping, 'utf8');
const repere = fs.readFileSync(files.repere, 'utf8');
const welcome = fs.existsSync(welcomePath) ? fs.readFileSync(welcomePath, 'utf8') : '';

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

// 4. MENU / ALLMENU — un seul rendu, effet newsletter Nexus Tech, deux CTA.
for (const marker of [
  'sendStyledMenuMessage', '[DIRECT NATIVE FLOW DELIVERY]', '[INTERACTIVE DELIVERY TIMEOUT]',
  '[ALLMENU SINGLE RICH DELIVERY]', '[DUAL CHANNEL CTA]', '[SINGLE COMMAND DELIVERY]',
  'forwardedNewsletterMessageInfo', "name: 'cta_url'", 'getImageBufferForStyle',
  'additionalNodes: buildRelayNodes()', "newsletterMetadata('jid', newsletterJid)",
  "display_text: '📢 Voir Nexus Tech'", "display_text: '🖤 Voir Otaku Nexus'",
]) {
  if (!menu.includes(marker)) throw new Error(`[verify-runtime] menu enrichi incomplet: ${marker}`);
}
if (!relayCall.test(menu)) throw new Error('[verify-runtime] relayMessage menu attendu mais absent');
if (menu.includes('waitForAck(') || menu.includes('sans ACK WhatsApp')) {
  throw new Error('[verify-runtime] ancien mécanisme ACK pouvant provoquer une double réponse menu/allmenu');
}

const menuSender = sliceRegion(
  menu,
  'async function sendStyledMenuMessage(',
  '// ══════════════════════════════════════════════════════════════\n// 📋 NAVIGATION PAR CATÉGORIES',
  'sendStyledMenuMessage'
);
if (menuSender.includes('viewOnceMessage: {')) {
  throw new Error('[verify-runtime] menu utilise encore le wrapper viewOnceMessage');
}
if ((menuSender.match(/display_text:\s*['"]📢 Voir Nexus Tech['"]/g) || []).length !== 1) {
  throw new Error('[verify-runtime] bouton Nexus Tech menu doit exister exactement une fois');
}
if ((menuSender.match(/display_text:\s*['"]🖤 Voir Otaku Nexus['"]/g) || []).length !== 1) {
  throw new Error('[verify-runtime] bouton Otaku Nexus menu doit exister exactement une fois');
}

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
for (const marker of [
  'buildAllMenuChunks', "fullMenuText = chunks.join('\\n\\n')",
  'sendStyledMenuMessage(', 'text: fullMenuText', 'withImage: true',
]) {
  if (!allmenuBlock.includes(marker)) throw new Error(`[verify-runtime] allmenu unifié incomplet: ${marker}`);
}
if (/for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*chunks\.length/.test(allmenuBlock)) {
  throw new Error('[verify-runtime] allmenu est encore séparé en plusieurs messages');
}

// 5. REPERE / REPÈRE — un seul rendu interactif + deux CTA, sans URL brute.
if (!/name\s*:\s*['"]repere['"]/.test(repere)) throw new Error('[verify-runtime] commande repere canonique absente');
const repereAliases = getAliases(repere, 'repere');
for (const alias of ['rep', 'repère']) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`['"]${escaped}['"]`).test(repereAliases)) throw new Error(`[verify-runtime] alias ${alias} absent de repere`);
}
if (!/ownerOnly\s*:\s*true/.test(repere)) throw new Error('[verify-runtime] protection ownerOnly de repere absente');
for (const marker of [
  'sendInteractiveRepere', '[DIRECT NATIVE FLOW DELIVERY]', '[DUAL CHANNEL CTA]', '[SINGLE COMMAND DELIVERY]',
  'forwardedNewsletterMessageInfo', "name: 'cta_url'", 'additionalNodes,',
  "newsletterMetadata('jid', effectiveNewsletterJid)", "display_text: '📢 Voir Nexus Tech'",
  "display_text: '🖤 Voir Otaku Nexus'", 'sendStandardNewsletterFallback', 'sendHardFallback',
  'const fallbackText = caption;',
]) {
  if (!repere.includes(marker)) throw new Error(`[verify-runtime] repere livraison incomplète: ${marker}`);
}
if (repere.includes('waitForAck(') || repere.includes('sans ACK WhatsApp')) {
  throw new Error('[verify-runtime] ancien mécanisme ACK pouvant provoquer une double réponse repere');
}
if (!relayCall.test(repere) || !sendCall.test(repere)) throw new Error('[verify-runtime] repere doit conserver relay + send fallback');
const repereSender = sliceRegion(repere, 'async function sendInteractiveRepere(', 'async function sendStandardNewsletterFallback(', 'sendInteractiveRepere');
if (repereSender.includes('viewOnceMessage: {')) {
  throw new Error('[verify-runtime] repere utilise encore le wrapper viewOnceMessage');
}
if ((repereSender.match(/display_text:\s*['"]📢 Voir Nexus Tech['"]/g) || []).length !== 1) {
  throw new Error('[verify-runtime] bouton Nexus Tech repere doit exister exactement une fois');
}
if ((repereSender.match(/display_text:\s*['"]🖤 Voir Otaku Nexus['"]/g) || []).length !== 1) {
  throw new Error('[verify-runtime] bouton Otaku Nexus repere doit exister exactement une fois');
}
const repereExecute = repere.slice(repere.indexOf('async execute('));
if (/fallbackText\s*=\s*[^;]*(?:channelUrl|whatsapp\.com\/channel)/s.test(repereExecute)) {
  throw new Error('[verify-runtime] repere réintroduit une URL brute dans son message');
}
const repereNewsletterFallback = sliceRegion(
  repere,
  'async function sendStandardNewsletterFallback(',
  'async function sendHardFallback(',
  'fallback newsletter repere'
);
if (/await\s+sock\.sendMessage\s*\(/.test(repereNewsletterFallback)) {
  throw new Error('[verify-runtime] fallback newsletter repere peut encore envoyer deux bulles séquentielles');
}

// 6. PING — une seule réponse, même moteur interactif et mêmes deux CTA.
for (const marker of [
  'function getConnectedPhoneNumber(sock)', 'sock?._sessionPhoneNumber', 'sock?.user?.id',
  'forwardedNewsletterMessageInfo', 'newsletterJid:', 'measureLatencyWithoutMessage',
  '[PING SINGLE RESPONSE]', '[PING DUAL CHANNEL CTA]', "sendPresenceUpdate('composing'",
  'menu.sendStyledMenuMessage', 'style: styleManager.getStyle()', 'withImage: false',
]) {
  if (!ping.includes(marker)) throw new Error(`[verify-runtime] ping session/CTA incomplet: ${marker}`);
}
if (ping.includes('const probe = await reply') || ping.includes('{ delete: probeKey }')) {
  throw new Error('[verify-runtime] ping crée encore une deuxième bulle de sonde');
}
if (/whatsapp\.com\/channel\//i.test(ping)) {
  throw new Error('[verify-runtime] ping contient une URL de chaîne brute');
}
const cfgNumberPos = ping.indexOf('config.ownerNumber');
const connectedFnPos = ping.indexOf('function getConnectedPhoneNumber(sock)');
if (cfgNumberPos < connectedFnPos) throw new Error('[verify-runtime] ping utilise config.ownerNumber avant identité socket');

// 7. WELCOME / GOODBYE — même moteur à deux CTA; fallback unique et sans URL.
// Ce fichier est injecté par le wrapper public. Le contrôle reste optionnel
// dans le dépôt privé seul, mais devient obligatoire dès qu'il existe au build.
if (welcome) {
  for (const marker of [
    'sendGroupEventCard', 'menu.sendStyledMenuMessage', 'imageBuffer: buffer',
    'withImage: true', 'caption: text', 'forwardedNewsletterMessageInfo',
  ]) {
    if (!welcome.includes(marker)) throw new Error(`[verify-runtime] welcome/goodbye incomplet: ${marker}`);
  }
  if (/whatsapp\.com\/channel\//i.test(welcome) || welcome.includes('const channelUrl =')) {
    throw new Error('[verify-runtime] welcome/goodbye contient encore un lien brut de chaîne');
  }
}

console.log('[verify-runtime] ✅ menu/allmenu/repere/ping/welcome/goodbye: réponse unique; CTA et liens bruts protégés');
