'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'utils', 'pairingService.js');
const MARK = '[PAIRING STABILITY GATE]';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`[pairing-gate] syntaxe invalide: ${r.stderr || r.stdout}`);
}

if (!fs.existsSync(FILE)) throw new Error('[pairing-gate] pairingService.js absent');
let src = fs.readFileSync(FILE, 'utf8');

if (!src.includes("require('./pairingGate')")) {
  const anchor = "const sessionIndex = require('./sessionIndex');";
  if (!src.includes(anchor)) throw new Error('[pairing-gate] imports pairingService inattendus');
  src = src.replace(anchor, `${anchor}\nconst pairingGate = require('./pairingGate'); // ${MARK}`);
}

if (!src.includes('async function createPairingSessionGuarded(')) {
  const anchor = '\nmodule.exports = {\n  createPairingSession,';
  if (!src.includes(anchor)) throw new Error('[pairing-gate] export createPairingSession introuvable');
  const wrapper = `\n// ${MARK}\n// Sérialise les demandes pour un même numéro et borne le nombre de pairings\n// simultanés. Cela évite la création de sockets concurrents et les états auth\n// incohérents quand site/Telegram/WhatsApp demandent le même pairing ensemble.\nasync function createPairingSessionGuarded(phoneNumber, options = {}) {\n  let release;\n  try {\n    release = await pairingGate.acquire(phoneNumber);\n  } catch (err) {\n    if (err?.code === 'PAIRING_BUSY') throw new PairingError('PAIRING_BUSY', err.message);\n    throw err;\n  }\n  try {\n    return await createPairingSession(phoneNumber, options);\n  } finally {\n    try { release?.(); } catch (_) {}\n  }\n}\n`;
  src = src.replace(anchor, `${wrapper}\nmodule.exports = {\n  createPairingSession: createPairingSessionGuarded,`);
}

fs.writeFileSync(FILE, src, 'utf8');
check(FILE);
check(path.join(ROOT, 'utils', 'pairingGate.js'));
console.log('[pairing-gate] ✅ verrou par numéro + limite globale de pairings installés');
