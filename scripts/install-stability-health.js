'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = path.join(ROOT, 'api', 'server.js');
const MARK = '[WHATSAPP STABILITY HEALTH]';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`[stability-health] syntaxe invalide ${path.relative(ROOT, file)}: ${r.stderr || r.stdout}`);
}

if (!fs.existsSync(API)) throw new Error('[stability-health] api/server.js absent');
let src = fs.readFileSync(API, 'utf8');

if (!src.includes("require('../utils/stabilityHealth')")) {
  const anchor = "const sessionManager = require('../utils/sessionManager');";
  if (!src.includes(anchor)) throw new Error('[stability-health] import sessionManager introuvable');
  src = src.replace(anchor, `${anchor}\nconst stabilityHealth = require('../utils/stabilityHealth'); // ${MARK}`);
}

if (!src.includes('stabilityHealth.snapshot(sessionManager)')) {
  const old = "        return sendJSON(res, 200, { status: 'ok' });";
  if (!src.includes(old)) throw new Error('[stability-health] route /health historique introuvable');
  src = src.replace(old, `        return sendJSON(res, 200, stabilityHealth.snapshot(sessionManager)); // ${MARK}`);
}

// Le Pairing Stability Gate utilise ce code quand le même numéro est déjà
// en préparation. Une réponse 429 est plus correcte qu'un 400 générique.
if (!src.includes('PAIRING_BUSY: 429')) {
  const anchor = '  COOLDOWN: 429,';
  if (src.includes(anchor)) src = src.replace(anchor, `${anchor}\n  PAIRING_BUSY: 429,`);
}

fs.writeFileSync(API, src, 'utf8');
check(API);
check(path.join(ROOT, 'utils', 'stabilityHealth.js'));
console.log('[stability-health] ✅ /health expose métriques agrégées sans numéros ni identifiants de session');
