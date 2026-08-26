'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'utils', 'sessionManager.js');
let src = fs.readFileSync(file, 'utf8');
const MARK = '[PAIRING CODE SOCKET LEASE]';
const LIVE_VERSION_MARK = '[PAIRING LIVE WA WEB VERSION]';
let changed = false;

// WhatsApp peut refuser l'association d'un nouvel appareil avec le message
// « Impossible de connecter l'appareil » même si requestPairingCode() a bien
// retourné un code lorsque la révision WhatsApp Web annoncée est périmée.
//
// sessionManager utilisait fetchLatestBaileysVersion(), qui suit la version
// inscrite dans le dépôt Baileys et peut être en retard sur web.whatsapp.com.
// Le projet possède déjà utils/waVersion.js : on l'utilise ici comme source
// de vérité. Pour un nouveau pairing on force un rafraîchissement live ; les
// reconnexions ordinaires gardent le cache afin d'éviter des requêtes réseau
// inutiles.
if (!src.includes(LIVE_VERSION_MARK)) {
  const contextImport = "const sessionContext = require('./sessionContext');";
  if (!src.includes(contextImport)) throw new Error('[pairing-stability] import sessionContext absent');
  src = src.replace(
    contextImport,
    `${contextImport}\nconst { getCurrentWhatsAppWebVersion } = require('./waVersion'); // ${LIVE_VERSION_MARK}`
  );

  // L'ancien helper n'est plus nécessaire ; waVersion.js conserve lui-même
  // fetchLatestBaileysVersion() comme fallback si le fetch live échoue.
  src = src.replace('  fetchLatestBaileysVersion,\n', '');

  const oldVersionHelper = `// ── Version Baileys (chargée une seule fois) ──────────────────────────────\nlet _baileysVersion = null;\nasync function getBaileysVersion() {\n  if (!_baileysVersion) {\n    const { version } = await fetchLatestBaileysVersion();\n    _baileysVersion = version;\n  }\n  return _baileysVersion;\n}`;
  const newVersionHelper = `// ── Version WhatsApp Web réellement courante ─────────────────────────────\n// ${LIVE_VERSION_MARK}\nasync function getBaileysVersion({ force = false } = {}) {\n  return getCurrentWhatsAppWebVersion({ force });\n}`;
  if (!src.includes(oldVersionHelper)) throw new Error('[pairing-stability] helper version Baileys inattendu');
  src = src.replace(oldVersionHelper, newVersionHelper);

  const versionCall = '  const version = await getBaileysVersion();';
  if (!src.includes(versionCall)) throw new Error('[pairing-stability] appel getBaileysVersion absent');
  src = src.replace(
    versionCall,
    '  const version = await getBaileysVersion({ force: !!opts.isPairing });'
  );

  changed = true;
}

if (!src.includes(MARK)) {
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

  changed = true;
}

if (changed) {
  fs.writeFileSync(file, src, 'utf8');
  console.log('[pairing-stability] ✅ pairing code stabilisé + version WhatsApp Web live');
} else {
  console.log('[pairing-stability] déjà appliqué');
}
