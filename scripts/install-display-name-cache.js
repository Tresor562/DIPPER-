'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const marker = '// [DISPLAY NAME CACHE]';

if (!fs.existsSync(handlerPath)) throw new Error('[display-name-cache] handler.js absent');

let src = fs.readFileSync(handlerPath, 'utf8');
if (src.includes(marker)) {
  console.log('[display-name-cache] déjà installé');
} else {
  const anchor = '    const isSuperMe = isSupremeOwner(sender);';
  const count = src.split(anchor).length - 1;
  if (count !== 1) {
    throw new Error(`[display-name-cache] ancre sender attendue 1 fois, trouvée ${count}`);
  }

  const injected = `${marker}\n    // Mémorise uniquement le nom que WhatsApp fournit dans pushName.\n    // Aucune tentative de contourner les réglages de confidentialité : si WA\n    // ne fournit pas le nom, .getname l'indiquera explicitement.\n    if (msg.pushName && sender) {\n      try {\n        const displayName = String(msg.pushName).trim();\n        if (displayName) database.updateUser(sender, { displayName, displayNameUpdatedAt: Date.now() });\n      } catch (_) {}\n    }\n\n${anchor}`;

  src = src.replace(anchor, injected);
  fs.writeFileSync(handlerPath, src, 'utf8');
  console.log('[display-name-cache] ✅ cache pushName installé');
}

const check = spawnSync(process.execPath, ['--check', handlerPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[display-name-cache] handler invalide: ${check.stderr || check.stdout}`);
}

const finalSrc = fs.readFileSync(handlerPath, 'utf8');
for (const required of [marker, 'database.updateUser(sender, { displayName', 'msg.pushName && sender']) {
  if (!finalSrc.includes(required)) throw new Error(`[display-name-cache] invariant absent: ${required}`);
}

console.log('[display-name-cache] ✅ noms observés disponibles pour .getname');
