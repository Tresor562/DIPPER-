'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'utils', 'sessionManager.js');
let src = fs.readFileSync(file, 'utf8');
const MARK = '[PAIRING CODE SOCKET LEASE]';

if (src.includes(MARK)) {
  console.log('[pairing-stability] déjà appliqué');
  process.exit(0);
}

const sessionAnchor = "    isRegistered: !!state.creds.registered, // [PHASE 3] déjà appairé (reconnexion) vs nouvelle session\n    isStopping: false,";
if (!src.includes(sessionAnchor)) throw new Error('[pairing-stability] session anchor absent');
src = src.replace(sessionAnchor,
  "    isRegistered: !!state.creds.registered, // [PHASE 3] déjà appairé (reconnexion) vs nouvelle session\n" +
  "    isPairing: !!opts.isPairing, // " + MARK + "\n" +
  "    pairingCodeIssuedAt: null,\n" +
  "    isStopping: false,"
);

const reconnectAnchor = "      const shouldReconnect = !terminalDisconnect && !_isShuttingDown && !session.isStopping;";
if (!src.includes(reconnectAnchor)) throw new Error('[pairing-stability] reconnect anchor absent');
src = src.replace(reconnectAnchor,
  "      // " + MARK + " : pendant qu'un code est en cours de saisie, ne jamais\n" +
  "      // recréer le socket automatiquement, sinon le code affiché devient invalide.\n" +
  "      const shouldReconnect = !terminalDisconnect && !_isShuttingDown && !session.isStopping && !session.isPairing;"
);

const openAnchor = "      session.isOnline = true;\n      session.isRegistered = true;";
if (!src.includes(openAnchor)) throw new Error('[pairing-stability] open anchor absent');
src = src.replace(openAnchor,
  "      session.isOnline = true;\n      session.isRegistered = true;\n      session.isPairing = false;\n      session.pairingCodeIssuedAt = null;"
);

const requestAnchor = "  const sock = session.sock;";
if (!src.includes(requestAnchor)) throw new Error('[pairing-stability] request anchor absent');
src = src.replace(requestAnchor,
  "  const sock = session.sock;\n  session.isPairing = true; // " + MARK
);

const returnAnchor = "  console.log(`[SessionManager] 🔑 Code pairing ${sessionId}: ${code}`);\n  return code;";
if (!src.includes(returnAnchor)) throw new Error('[pairing-stability] code return anchor absent');
src = src.replace(returnAnchor,
  "  session.pairingCodeIssuedAt = Date.now();\n" +
  "  console.log(`[SessionManager] 🔑 Code pairing ${sessionId}: ${code}`);\n" +
  "  return code;"
);

fs.writeFileSync(file, src, 'utf8');
console.log('[pairing-stability] ✅ pairing code verrouillé sur le socket générateur');
