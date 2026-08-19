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

if (!src.includes('whatsappStabilityGuard.reconnectDelay(reconnectAttempts, statusCode)')) {
  const old = '        const delay = Math.min(2000 * Math.pow(1.3, reconnectAttempts), 15000);';
  if (src.includes(old)) {
    src = src.replace(old, '        const delay = whatsappStabilityGuard.reconnectDelay(reconnectAttempts, statusCode); // ' + MARK);
  } else if (!/const delay = whatsappStabilityGuard\.reconnectDelay\(/.test(src)) {
    throw new Error('[wa-stability] formule reconnexion introuvable');
  }
}

// Heartbeat modéré, idempotent. On évite de remplacer tous les setInterval du fichier.
if (!src.includes('[WHATSAPP STABILITY HEARTBEAT]')) {
  const hb = "      }, 30000);\n\n      // ── Message de bienvenue";
  const hb55 = "      }, 55000); // [WHATSAPP STABILITY GUARD]\n\n      // ── Message de bienvenue";
  if (src.includes(hb)) src = src.replace(hb, "      }, 55000); // [WHATSAPP STABILITY HEARTBEAT]\n\n      // ── Message de bienvenue");
  else if (src.includes(hb55)) src = src.replace(hb55, "      }, 55000); // [WHATSAPP STABILITY HEARTBEAT]\n\n      // ── Message de bienvenue");
  else if (!/heartbeat[\s\S]{0,500}55000/.test(src)) console.warn('[wa-stability] heartbeat déjà restructuré, aucune modification');
}

if (!src.includes('whatsappStabilityGuard.markSocketOpen(sock)')) {
  const anchor = "    } else if (connection === 'open') {\n      session.isOnline = true;";
  if (!src.includes(anchor)) throw new Error('[wa-stability] branche connection=open introuvable');
  src = src.replace(anchor, "    } else if (connection === 'open') {\n      whatsappStabilityGuard.markSocketOpen(sock); // " + MARK + "\n      session.isOnline = true;");
}

if (!src.includes('whatsappStabilityGuard.markSocketClosed(session.sock)')) {
  const anchor = "  try { session.sock?.end?.(new Error(reason)); } catch {}";
  if (!src.includes(anchor)) throw new Error('[wa-stability] fermeture socket introuvable');
  src = src.replace(anchor, `  try { whatsappStabilityGuard.markSocketClosed(session.sock); } catch {} // ${MARK}\n${anchor}`);
}

fs.writeFileSync(SESSION, src, 'utf8');
check(SESSION);
check(path.join(ROOT, 'utils', 'whatsappStabilityGuard.js'));
console.log('[wa-stability] ✅ garde stabilité installé: send+relay queue, burst soft-limit, retry transitoire, circuit breaker, backoff+jitter, heartbeat modéré');
