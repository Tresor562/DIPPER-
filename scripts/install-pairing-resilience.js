'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.js');
const sessionPath = path.join(ROOT, 'utils', 'sessionManager.js');
const versionPath = path.join(ROOT, 'utils', 'waVersion.js');

function replaceOnce(src, search, replacement, marker, label) {
  if (marker && src.includes(marker)) {
    console.log(`[pairing-resilience] ${label} déjà appliqué`);
    return src;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[pairing-resilience] ${label}: attendu 1 occurrence, trouvé ${count}`);
  }
  console.log(`[pairing-resilience] ${label} appliqué`);
  return src.replace(search, replacement);
}

function nodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `[pairing-resilience] syntaxe invalide ${path.relative(ROOT, file)}: ${result.stderr || result.stdout}`
    );
  }
}

function markExistingStableWaVersion(session) {
  if (session.includes('[PAIRING LIVE WA VERSION]')) return session;

  // Le wrapper Render applique stability-patch.js AVANT ce script.
  // Ce patch peut déjà avoir remplacé getBaileysVersion() par
  // fetchLatestWaWebVersion(). C'est un état valide : on le reconnaît
  // explicitement au lieu d'exiger l'ancienne implémentation exacte.
  if (session.includes('[SessionManager] 🌐 WA Web version:')) {
    const anchor = 'let _baileysVersion = null;';
    const count = session.split(anchor).length - 1;
    if (count !== 1) {
      throw new Error(
        `[pairing-resilience] version WA dynamique préexistante: ancre attendue 1 fois, trouvée ${count}`
      );
    }
    console.log('[pairing-resilience] version WhatsApp Web live multi-session déjà fournie par stability-patch');
    return session.replace(
      anchor,
      `// [PAIRING LIVE WA VERSION] compatible stability-patch + résolveur live\n${anchor}`
    );
  }

  return replaceOnce(
    session,
    "    const { version } = await fetchLatestBaileysVersion();\n    _baileysVersion = version;",
    "    // [PAIRING LIVE WA VERSION] Toujours préférer la version réellement servie par web.whatsapp.com.\n    const version = await getCurrentWhatsAppWebVersion();\n    _baileysVersion = version;",
    '[PAIRING LIVE WA VERSION]',
    'version WhatsApp Web live multi-session'
  );
}

function install() {
  if (!fs.existsSync(versionPath)) {
    throw new Error('[pairing-resilience] utils/waVersion.js absent');
  }

  let index = fs.readFileSync(indexPath, 'utf8');
  let session = fs.readFileSync(sessionPath, 'utf8');

  index = replaceOnce(
    index,
    "const os      = require('os');",
    "const os      = require('os');\nconst { getCurrentWhatsAppWebVersion } = require('./utils/waVersion'); // [PAIRING VERSION SOURCE]",
    '[PAIRING VERSION SOURCE]',
    'source version WA live dans index.js'
  );

  index = replaceOnce(
    index,
    '  const { version } = await fetchLatestBaileysVersion();',
    "  // [PAIRING LIVE WA VERSION] fetchLatestBaileysVersion peut être en retard et produire un code refusé par WhatsApp.\n  const version = await getCurrentWhatsAppWebVersion();",
    '[PAIRING LIVE WA VERSION]',
    'version WhatsApp Web live dans index.js'
  );

  index = replaceOnce(
    index,
    '    keepAliveIntervalMs: 30000,   // [FIX] 5s→30s évite le flood WebSocket',
    "    // [PAIRING SOCKET TIMEOUTS]\n    connectTimeoutMs: 60000,\n    defaultQueryTimeoutMs: 60000,\n    keepAliveIntervalMs: 30000,   // [FIX] 5s→30s évite le flood WebSocket",
    '[PAIRING SOCKET TIMEOUTS]',
    'timeouts socket principal'
  );

  session = replaceOnce(
    session,
    "const sessionContext = require('./sessionContext');",
    "const sessionContext = require('./sessionContext');\nconst { getCurrentWhatsAppWebVersion } = require('./waVersion'); // [PAIRING VERSION SOURCE]",
    '[PAIRING VERSION SOURCE]',
    'source version WA live dans sessionManager.js'
  );

  session = markExistingStableWaVersion(session);

  session = replaceOnce(
    session,
    '    keepAliveIntervalMs: 30000,',
    "    // [PAIRING SOCKET TIMEOUTS]\n    connectTimeoutMs: 60000,\n    defaultQueryTimeoutMs: 60000,\n    keepAliveIntervalMs: 30000,",
    '[PAIRING SOCKET TIMEOUTS]',
    'timeouts sockets multi-session'
  );

  session = replaceOnce(
    session,
    '  const delayMs = opts.delayMs ?? 3000;',
    "  // [PAIRING READY GRACE] 5s réduit les 428/Precondition pendant la poignée de main initiale.\n  const delayMs = opts.delayMs ?? 5000;",
    '[PAIRING READY GRACE]',
    'délai de préparation avant code'
  );

  const requestOld = `  const timeoutMs = opts.timeoutMs ?? 20000;
  let raw;
  try {
    raw = await withTimeout(
      sock.requestPairingCode(String(phoneNumber).replace(/\\D/g, '')),
      timeoutMs,
      'requestPairingCode'
    );
  } catch (err) {
    logCriticalSessionError(\`❗ pairing \${sessionId} échoué — \${err.message || err}\`);
    throw err;
  }`;

  const requestNew = `  // [PAIRING TRANSIENT RETRY]
  // 408/428/515 peuvent arriver pendant l'initialisation/restart du socket.
  // On ne régénère un code que si requestPairingCode() lui-même échoue :
  // une fois un code retourné à l'utilisateur, aucun retry silencieux ne vient
  // invalider ce code pendant qu'il est saisi dans WhatsApp.
  const timeoutMs = opts.timeoutMs ?? 25000;
  const maxAttempts = Math.max(1, Math.min(4, Number(opts.maxAttempts ?? 3)));
  const retryDelayMs = Math.max(500, Number(opts.retryDelayMs ?? 2500));

  let raw = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      raw = await withTimeout(
        sock.requestPairingCode(String(phoneNumber).replace(/\\D/g, '')),
        timeoutMs,
        \`requestPairingCode tentative \${attempt}/\${maxAttempts}\`
      );

      if (!raw) throw new Error('WhatsApp a retourné un code de pairing vide');
      break;
    } catch (err) {
      lastError = err;
      const statusCode = Number(
        err?.output?.statusCode
        ?? err?.data?.statusCode
        ?? err?.statusCode
        ?? 0
      );
      const message = String(err?.message || err);
      const transient = [408, 428, 515].includes(statusCode)
        || /timeout|timed out|precondition|connection (?:closed|failure)|restart|required|qr refs attempts ended/i.test(message);

      logCriticalSessionError(
        \`❗ pairing \${sessionId} tentative \${attempt}/\${maxAttempts} échouée — code=\${statusCode || '?'} — \${message}\`
      );

      if (!transient || attempt >= maxAttempts) break;

      const waitMs = retryDelayMs * attempt;
      console.log(\`[SessionManager] 🔁 pairing \${sessionId}: retry dans \${waitMs}ms\`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  if (!raw) {
    throw lastError || new Error('Impossible de générer le code de pairing');
  }`;

  session = replaceOnce(
    session,
    requestOld,
    requestNew,
    '[PAIRING TRANSIENT RETRY]',
    'retry contrôlé requestPairingCode'
  );

  fs.writeFileSync(indexPath, index);
  fs.writeFileSync(sessionPath, session);

  for (const file of [versionPath, indexPath, sessionPath]) nodeCheck(file);

  const finalIndex = fs.readFileSync(indexPath, 'utf8');
  const finalSession = fs.readFileSync(sessionPath, 'utf8');

  for (const marker of [
    '[PAIRING VERSION SOURCE]',
    '[PAIRING LIVE WA VERSION]',
    '[PAIRING SOCKET TIMEOUTS]',
  ]) {
    if (!finalIndex.includes(marker)) {
      throw new Error(`[pairing-resilience] garde-fou index absent: ${marker}`);
    }
  }

  for (const marker of [
    '[PAIRING VERSION SOURCE]',
    '[PAIRING LIVE WA VERSION]',
    '[PAIRING SOCKET TIMEOUTS]',
    '[PAIRING READY GRACE]',
    '[PAIRING TRANSIENT RETRY]',
  ]) {
    if (!finalSession.includes(marker)) {
      throw new Error(`[pairing-resilience] garde-fou session absent: ${marker}`);
    }
  }

  if (!finalIndex.includes('getCurrentWhatsAppWebVersion()')) {
    throw new Error('[pairing-resilience] index.js utilise encore une version WA non résolue');
  }

  const sessionUsesLiveVersion =
    finalSession.includes('const version = await getCurrentWhatsAppWebVersion();')
    || finalSession.includes('[SessionManager] 🌐 WA Web version:');

  if (!sessionUsesLiveVersion) {
    throw new Error('[pairing-resilience] sessionManager.js n’utilise aucune source WA Web live');
  }

  if (!finalSession.includes('opts.maxAttempts ?? 3')) {
    throw new Error('[pairing-resilience] retries pairing absents');
  }

  console.log('[pairing-resilience] ✅ compatible wrapper Render + version WA live + préparation socket + retries transitoires');
}

if (require.main === module) install();
module.exports = { install };