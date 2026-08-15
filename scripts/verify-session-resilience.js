'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { install: installPairingResilience } = require('./install-pairing-resilience');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.js');
const sessionPath = path.join(ROOT, 'utils', 'sessionManager.js');
const pairingPath = path.join(ROOT, 'utils', 'pairingService.js');
const versionPath = path.join(ROOT, 'utils', 'waVersion.js');

// Le vérificateur est déjà exécuté dans prestart juste après le chantier
// session-lifecycle : on en profite pour installer le correctif pairing au
// même endroit sans ajouter une nouvelle étape fragile à la longue chaîne npm.
installPairingResilience();

for (const file of [indexPath, sessionPath, pairingPath, versionPath]) {
  if (!fs.existsSync(file)) throw new Error(`[verify-sessions] fichier absent: ${file}`);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[verify-sessions] syntaxe invalide: ${check.stderr || check.stdout}`);
}

const index = fs.readFileSync(indexPath, 'utf8');
const session = fs.readFileSync(sessionPath, 'utf8');
const pairing = fs.readFileSync(pairingPath, 'utf8');
const version = fs.readFileSync(versionPath, 'utf8');

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

// Pairing robuste : la version live doit être utilisée pour le socket principal
// et les sous-sessions, puis requestPairingCode doit attendre et retry seulement
// avant qu'un code ait été retourné à l'utilisateur.
for (const marker of [
  '[PAIRING VERSION SOURCE]',
  '[PAIRING LIVE WA VERSION]',
  '[PAIRING SOCKET TIMEOUTS]',
]) {
  if (!index.includes(marker)) throw new Error(`[verify-sessions] pairing index incomplet: ${marker}`);
}

for (const marker of [
  '[PAIRING VERSION SOURCE]',
  '[PAIRING LIVE WA VERSION]',
  '[PAIRING SOCKET TIMEOUTS]',
  '[PAIRING READY GRACE]',
  '[PAIRING TRANSIENT RETRY]',
]) {
  if (!session.includes(marker)) throw new Error(`[verify-sessions] pairing session incomplet: ${marker}`);
}

if (!version.includes('fetchLatestWaWebVersion')) {
  throw new Error('[verify-sessions] résolveur WhatsApp Web live absent');
}
if (!session.includes('opts.maxAttempts ?? 3')) {
  throw new Error('[verify-sessions] retry requestPairingCode absent');
}

console.log('[verify-sessions] ✅ sessions persistantes + pairing WA live + retries protégés');
