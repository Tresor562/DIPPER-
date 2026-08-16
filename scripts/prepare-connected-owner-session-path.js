'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const file = path.join(ROOT, 'utils', 'sessionManager.js');
if (!fs.existsSync(file)) throw new Error('[owner-session-path] utils/sessionManager.js introuvable');

let src = fs.readFileSync(file, 'utf8');

const oldListener = "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify') return;";
const newListener = "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify' && type !== 'append') return;";

if (src.includes(oldListener)) {
  src = src.replace(oldListener, newListener);
  console.log('[owner-session-path] notify + append activés pour les sous-sessions');
} else if (!src.includes(newListener)) {
  throw new Error('[owner-session-path] listener principal introuvable');
}

const listenerPos = src.indexOf(newListener);
const loop = "    for (const msg of messages) {\n      if (!msg.message || !msg.key?.id) continue;";
const guard = "      // Les append entrants non-fromMe sont des doublons; seul le compte connecté les utilise.\n      if (type === 'append' && !msg.key.fromMe) continue;";
const loopPos = listenerPos < 0 ? -1 : src.indexOf(loop, listenerPos);
if (loopPos < 0) throw new Error('[owner-session-path] boucle messages du listener principal introuvable');

const nearby = src.slice(loopPos, loopPos + loop.length + guard.length + 128);
if (!nearby.includes("type === 'append' && !msg.key.fromMe")) {
  src = src.slice(0, loopPos) + loop + '\n' + guard + src.slice(loopPos + loop.length);
  console.log('[owner-session-path] append non-fromMe filtrés');
}

fs.writeFileSync(file, src, 'utf8');

const final = fs.readFileSync(file, 'utf8');
if (!final.includes("type !== 'notify' && type !== 'append'")) throw new Error('[owner-session-path] garde notify/append absente');
if (!final.includes("type === 'append' && !msg.key.fromMe")) throw new Error('[owner-session-path] garde append/fromMe absente');
if (!final.includes('sock._sessionPhoneNumber')) throw new Error('[owner-session-path] numéro owner local non injecté');

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (check.status !== 0) throw new Error('[owner-session-path] syntaxe sessionManager invalide: ' + (check.stderr || check.stdout));

console.log('[owner-session-path] ✅ le téléphone connecté atteint le handler en notify ou append/fromMe');
