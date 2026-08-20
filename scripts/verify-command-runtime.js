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
  allmenu: path.join(ROOT, 'commands', 'general_tools', 'allmenu.js'),
  ping: path.join(ROOT, 'commands', 'general_tools', 'ping.js'),
  repere: path.join(ROOT, 'commands', 'bot_sovereignty', 'repere.js'),
  responseInstaller: path.join(ROOT, 'scripts', 'install-response-style.js'),
  runtimeInstaller: path.join(ROOT, 'scripts', 'install-command-runtime-fixes.js'),
  styleCatalog: path.join(ROOT, 'utils', 'styleCatalog.js'),
  carousel: path.join(ROOT, 'utils', 'whatsappCarousel.js'),
};

function checkSyntax(label, file) {
  if (!fs.existsSync(file)) throw new Error(`[verify-runtime] ${label} absent: ${file}`);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[verify-runtime] syntaxe invalide ${label}: ${check.stderr || check.stdout}`);
}

for (const [label, file] of Object.entries(files)) checkSyntax(label, file);

const read = key => fs.readFileSync(files[key], 'utf8');
const handler = read('handler');
const session = read('session');
const index = read('index');
const menu = read('menu');
const allmenu = read('allmenu');
const ping = read('ping');
const repere = read('repere');
const styleCatalog = read('styleCatalog');
const carousel = read('carousel');

// Réponses : le watchdog et les transports doivent rester actifs.
for (const marker of ['[RESPONSE STYLE DISCIPLINE]', '[COMMAND RESPONSE WATCHDOG]', 'responseTrace.responses += 1']) {
  if (!handler.includes(marker)) throw new Error(`[verify-runtime] suivi réponse absent: ${marker}`);
}
if (!handler.includes('relayMessage') || !handler.includes('sendMessage')) {
  throw new Error('[verify-runtime] transports send/relay absents du handler');
}

// Routage multi-session notify + append/fromMe.
for (const source of [session, index]) {
  if (!source.includes("type !== 'notify'") || !source.includes("type !== 'append'")) {
    throw new Error('[verify-runtime] routage notify/append incomplet');
  }
}
if (!session.includes('[SESSION OWN APPEND ROUTING]')) {
  throw new Error('[verify-runtime] marqueur append multi-session absent');
}

// Accès/permissions sensibles.
for (const marker of ['[PUBLIC COMMAND ACCESS FIX]', 'if (!access.allowed)', 'command.ownerOnly', 'command.groupOnly']) {
  if (!handler.includes(marker)) throw new Error(`[verify-runtime] permission/guard absent: ${marker}`);
}

// MENU principal : syntaxe + branche style active. Le rendu historique peut rester
// présent, mais allmenu v2 est désormais un module séparé et ne doit plus être
// vérifié avec les anciennes ancres DIRECT NATIVE FLOW DELIVERY.
if (!menu.includes('styleManager') || !menu.includes('module.exports')) {
  throw new Error('[verify-runtime] menu principal incomplet');
}

// ALLMENU v2 : carrousel horizontal paginé, média thématique, newsletter et CTA.
for (const marker of ['PAGE_SIZE=8', 'sendCarousel', 'getStyleImageBuffer', 'newsletterContext', 'urlButton', "name:'allmenu'"]) {
  if (!allmenu.replace(/\s+/g, '').includes(marker.replace(/\s+/g, ''))) {
    throw new Error(`[verify-runtime] allmenu v2 incomplet: ${marker}`);
  }
}
for (const marker of ['fallbackText', 'Chaîne', 'Support', 'Telegram']) {
  if (!allmenu.includes(marker)) throw new Error(`[verify-runtime] fallback/CTA allmenu absent: ${marker}`);
}

// Catalogue v2 : 32 styles numérotés 0..31 et pools médias.
if (!/const\s+MAX_STYLE\s*=\s*31\s*;/.test(styleCatalog)) {
  throw new Error('[verify-runtime] catalogue styles v2 attendu (MAX_STYLE=31)');
}
for (let id = 21; id <= 31; id++) {
  if (!new RegExp(`\\b${id}\\s*:`).test(styleCatalog)) throw new Error(`[verify-runtime] style ${id} absent du catalogue`);
}
if (!styleCatalog.includes('IMAGE_PAGES')) throw new Error('[verify-runtime] pools médias styles absents');

// Le transport carrousel doit conserver une chaîne de fallback anti-silence.
for (const marker of ['relayMessage', 'sendMessage', 'fallbackText']) {
  if (!carousel.includes(marker)) throw new Error(`[verify-runtime] transport carrousel incomplet: ${marker}`);
}

// REPERE : commande canonique et protection owner.
if (!/name\s*:\s*['"]repere['"]/.test(repere)) throw new Error('[verify-runtime] commande repere canonique absente');
if (!/ownerOnly\s*:\s*true/.test(repere)) throw new Error('[verify-runtime] protection ownerOnly de repere absente');

// PING : doit rester une commande réelle et utiliser le socket connecté.
if (!ping.includes('module.exports') || !ping.includes('sock')) throw new Error('[verify-runtime] ping incomplet');

console.log('[verify-runtime] ✅ runtime, permissions, multi-session, styles 0..31, allmenu v2 et fallbacks validés');
