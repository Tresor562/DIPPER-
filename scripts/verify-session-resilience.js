'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const sessionPath = path.join(ROOT, 'utils', 'sessionManager.js');
const pairingPath = path.join(ROOT, 'utils', 'pairingService.js');

for (const file of [sessionPath, pairingPath]) {
  if (!fs.existsSync(file)) throw new Error(`[verify-sessions] fichier absent: ${file}`);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[verify-sessions] syntaxe invalide: ${check.stderr || check.stdout}`);
}

const session = fs.readFileSync(sessionPath, 'utf8');
const pairing = fs.readFileSync(pairingPath, 'utf8');

for (const marker of [
  '[SESSION IMMORTAL RECONNECT]',
  '[SESSION IMMORTAL POLICY]',
  'const terminalDisconnect = statusCode === DisconnectReason.loggedOut',
  'async function deleteSessionData(',
  'async function purgeSessionPersistence(',
  '  deleteSessionData,',
]) {
  if (!session.includes(marker)) throw new Error(`[verify-sessions] garde-fou absent: ${marker}`);
}

const immortalStart = session.indexOf('// [SESSION IMMORTAL POLICY]');
const immortalBlock = immortalStart >= 0 ? session.slice(immortalStart, immortalStart + 950) : '';
if (!immortalBlock.includes('statusCode === DisconnectReason.loggedOut')) {
  throw new Error('[verify-sessions] branche loggedOut immortelle absente');
}
if (/purgeSessionPersistence\s*\(|deleteSessionData\s*\(/.test(immortalBlock)) {
  throw new Error('[verify-sessions] loggedOut supprime encore automatiquement la session');
}

const reconnectStart = session.indexOf('// [SESSION IMMORTAL RECONNECT]');
const reconnectBlock = reconnectStart >= 0 ? session.slice(reconnectStart, reconnectStart + 750) : '';
if (/terminalDisconnect[\s\S]{0,350}DisconnectReason\.(connectionReplaced|badSession)/.test(reconnectBlock)) {
  throw new Error('[verify-sessions] connectionReplaced/badSession encore terminal');
}
if (!reconnectBlock.includes('shouldReconnect = !terminalDisconnect')) {
  throw new Error('[verify-sessions] boucle de reconnexion absente');
}

// Les purges automatiques restantes sont autorisées uniquement avant qu'une
// session soit réellement enregistrée (code abandonné / pairing impossible).
if (!session.includes('!session.isRegistered && !session.isOnline')) {
  throw new Error('[verify-sessions] sweep pairings non enregistrés non borné');
}
if (!pairing.includes("'code de pairing non obtenu'")) {
  throw new Error('[verify-sessions] rollback pairing jamais enregistré absent');
}

console.log('[verify-sessions] ✅ sessions enregistrées persistantes; suppression manuelle uniquement; reconnect auto protégé');
