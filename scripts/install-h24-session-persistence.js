'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'utils', 'sessionManager.js');
const MARK = '[H24 SESSION PERSISTENCE]';

function syntaxCheck(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`[h24-persistence] syntaxe invalide ${path.relative(ROOT, file)}: ${r.stderr || r.stdout}`);
}

if (!fs.existsSync(FILE)) throw new Error('[h24-persistence] utils/sessionManager.js absent');
let src = fs.readFileSync(FILE, 'utf8');

// Ajoute le restaurateur Mongo au destructuring existant sans dépendre de l'ordre exact.
if (!src.includes('restoreSessionFiles')) {
  const re = /const\s*\{([^}]*\buseFileAuthState\b[^}]*)\}\s*=\s*require\(['"]\.\/fileAuthState['"]\);/;
  const m = src.match(re);
  if (!m) throw new Error('[h24-persistence] import fileAuthState introuvable');
  const names = m[1].trim().replace(/,\s*$/, '');
  src = src.replace(re, `const { ${names}, restoreSessionFiles } = require('./fileAuthState'); // ${MARK}`);
}

// Ancien comportement : abandonner la session quand le disque local a disparu.
// Nouveau comportement : restaurer depuis Mongo, puis seulement abandonner si
// aucune sauvegarde durable n'existe réellement.
if (!src.includes('await restoreSessionFiles(meta.sessionId)')) {
  const oldBlock = `      if (!sessionDirExists(meta.sessionId)) {\n        console.error(\`[SessionManager] ⚠️  Session \${meta.sessionId} indexée dans MongoDB mais aucun dossier local de credentials trouvé — reconnexion impossible sans migration (voir scripts/migrate-sessions-to-hybrid.js).\`);\n        continue;\n      }`;
  const replacement = `      if (!sessionDirExists(meta.sessionId)) {\n        console.log(\`[SessionManager] ♻️ \${meta.sessionId} sans credentials locaux — restauration MongoDB...\`); // ${MARK}\n        const restored = await restoreSessionFiles(meta.sessionId).catch(err => {\n          console.error(\`[SessionManager] restauration durable \${meta.sessionId} échouée:\`, err.message);\n          return false;\n        });\n        if (!restored || !sessionDirExists(meta.sessionId)) {\n          console.error(\`[SessionManager] ⚠️ \${meta.sessionId}: aucune sauvegarde credentials locale/Mongo exploitable — pairing requis une fois pour créer la sauvegarde H24.\`);\n          await sessionIndex.setState(meta.sessionId, { isOnline: false }).catch(() => {});\n          continue;\n        }\n      }`;
  if (src.includes(oldBlock)) {
    src = src.replace(oldBlock, replacement);
  } else {
    // Tolère les patchs précédents ayant changé le texte du log.
    const generic = /\s{6}if \(!sessionDirExists\(meta\.sessionId\)\) \{[\s\S]{0,700}?\n\s{8}continue;\n\s{6}\}/;
    if (!generic.test(src)) throw new Error('[h24-persistence] bloc sessionDirExists de loadAllSessions introuvable');
    src = src.replace(generic, `\n${replacement}`);
  }
}

fs.writeFileSync(FILE, src, 'utf8');
syntaxCheck(FILE);
syntaxCheck(path.join(ROOT, 'utils', 'fileAuthState.js'));

if (!src.includes('await restoreSessionFiles(meta.sessionId)')) throw new Error('[h24-persistence] restauration non installée');
console.log('[h24-persistence] ✅ restauration MongoDB des credentials activée avant reconnexion des sessions');
