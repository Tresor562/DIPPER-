'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SESSION = path.join(ROOT, 'utils', 'sessionManager.js');
const MARK = '[WHATSAPP STABILITY GUARD]';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`[wa-stability] syntaxe invalide ${path.relative(ROOT, file)}: ${r.stderr || r.stdout}`);
}

if (!fs.existsSync(SESSION)) throw new Error('[wa-stability] utils/sessionManager.js absent');
let src = fs.readFileSync(SESSION, 'utf8');

if (!src.includes("require('./whatsappStabilityGuard')")) {
  const anchor = "const sessionContext = require('./sessionContext');";
  if (!src.includes(anchor)) throw new Error('[wa-stability] import sessionContext introuvable');
  src = src.replace(anchor, `${anchor}\nconst whatsappStabilityGuard = require('./whatsappStabilityGuard'); // ${MARK}`);
}

if (!src.includes('whatsappStabilityGuard.installSendGuard(sock, sessionId)')) {
  const anchor = '  const session = {';
  if (!src.includes(anchor)) throw new Error('[wa-stability] ancre session introuvable');
  src = src.replace(anchor, `  whatsappStabilityGuard.installSendGuard(sock, sessionId); // ${MARK}\n\n${anchor}`);
}

// Reconnexion moins agressive : backoff exponentiel + jitter, plafonné à 2 min.
if (!src.includes('whatsappStabilityGuard.reconnectDelay(reconnectAttempts, statusCode)')) {
  const old = '        const delay = Math.min(2000 * Math.pow(1.3, reconnectAttempts), 15000);';
  if (!src.includes(old)) throw new Error('[wa-stability] formule reconnexion historique introuvable');
  src = src.replace(old, '        const delay = whatsappStabilityGuard.reconnectDelay(reconnectAttempts, statusCode); // ' + MARK);
}

// Evite un heartbeat trop fréquent. Une présence toutes les ~55s suffit pour
// détecter un socket vivant sans générer de bruit artificiel permanent.
src = src.replace('      }, 30000);', '      }, 55000); // ' + MARK);

if (!src.includes('whatsappStabilityGuard.markSocketClosed(session.sock)')) {
  const anchor = "  try { session.sock?.end?.(new Error(reason)); } catch {}";
  if (!src.includes(anchor)) throw new Error('[wa-stability] fermeture socket introuvable');
  src = src.replace(anchor, `  try { whatsappStabilityGuard.markSocketClosed(session.sock); } catch {} // ${MARK}\n${anchor}`);
}

fs.writeFileSync(SESSION, src, 'utf8');
check(SESSION);
check(path.join(ROOT, 'utils', 'whatsappStabilityGuard.js'));
console.log('[wa-stability] ✅ garde stabilité installé: queue envoi, retry transitoire, backoff+jitter, heartbeat modéré');
