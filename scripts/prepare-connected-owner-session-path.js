'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const file = path.join(ROOT, 'utils', 'sessionManager.js');
if (!fs.existsSync(file)) throw new Error('[owner-session-path] utils/sessionManager.js introuvable');

let src = fs.readFileSync(file, 'utf8');
const notifyAppendNeedle = "type !== 'notify' && type !== 'append'";
const appendGuardNeedle = "type === 'append' && !msg.key.fromMe";

// Idempotence : d'autres installateurs peuvent reformater le listener après le
// premier passage. On valide donc d'abord la sémantique, puis on ne patche que
// l'ancienne garde notify-only si elle existe encore.
if (!src.includes(notifyAppendNeedle)) {
  const oldExact = "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify') return;";
  const newExact = "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify' && type !== 'append') return;";
  if (src.includes(oldExact)) {
    src = src.replace(oldExact, newExact);
  } else {
    const listenerRe = /(sock\.ev\.on\(['"]messages\.upsert['"][\s\S]{0,500}?if\s*\(\s*type\s*!==\s*['"]notify['"]\s*\)\s*return\s*;)/;
    const match = src.match(listenerRe);
    if (!match) throw new Error('[owner-session-path] listener principal introuvable');
    const patched = match[1].replace(/if\s*\(\s*type\s*!==\s*['"]notify['"]\s*\)\s*return\s*;/, "if (type !== 'notify' && type !== 'append') return;");
    src = src.replace(match[1], patched);
  }
  console.log('[owner-session-path] notify + append activés pour les sous-sessions');
} else {
  console.log('[owner-session-path] notify + append déjà actifs');
}

if (!src.includes(appendGuardNeedle)) {
  const listenerPos = src.search(/sock\.ev\.on\(['"]messages\.upsert['"]/);
  if (listenerPos < 0) throw new Error('[owner-session-path] listener messages.upsert introuvable');
  const tail = src.slice(listenerPos);
  const loopMatch = tail.match(/for\s*\(\s*const\s+msg\s+of\s+messages\s*\)\s*\{/);
  if (!loopMatch || loopMatch.index == null) throw new Error('[owner-session-path] boucle messages du listener principal introuvable');
  const insertAt = listenerPos + loopMatch.index + loopMatch[0].length;
  const guard = "\n      // Les append entrants non-fromMe sont des doublons; seul le compte connecté les utilise.\n      if (type === 'append' && !msg.key.fromMe) continue;";
  src = src.slice(0, insertAt) + guard + src.slice(insertAt);
  console.log('[owner-session-path] append non-fromMe filtrés');
} else {
  console.log('[owner-session-path] garde append/fromMe déjà active');
}

fs.writeFileSync(file, src, 'utf8');

const final = fs.readFileSync(file, 'utf8');
if (!final.includes(notifyAppendNeedle)) throw new Error('[owner-session-path] garde notify/append absente');
if (!final.includes(appendGuardNeedle)) throw new Error('[owner-session-path] garde append/fromMe absente');
if (!final.includes('sock._sessionPhoneNumber')) throw new Error('[owner-session-path] numéro owner local non injecté');

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[owner-session-path] syntaxe sessionManager invalide: ' + (check.stderr || check.stdout));

console.log('[owner-session-path] ✅ le téléphone connecté atteint le handler en notify ou append/fromMe');
