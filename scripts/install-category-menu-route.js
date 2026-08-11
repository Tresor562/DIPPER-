'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const marker = '[CATEGORY MENU PHRASE]';

let handler = fs.readFileSync(handlerPath, 'utf8');

if (!handler.includes(marker)) {
  const anchor = '    // ── CUSTOM REPLY — réponses automatiques personnalisées ─────────────';
  const replacement = `    // ── [CATEGORY MENU PHRASE] ───────────────────────────────\n    // Navigation du menu : accepte \"Groupe Menu\", \"Download Menu\", etc.\n    // Cette branche affiche seulement les commandes d'une catégorie ; elle\n    // n'exécute aucune commande et ne modifie donc pas leurs permissions.\n    if (body) {\n      try {\n        const { handleCategoryMenuPhrase } = require('./utils/categoryMenu');\n        if (await handleCategoryMenuPhrase(sock, msg, { from }, body, config.prefix)) return;\n      } catch (err) {\n        console.error('[category-menu]', err.message);\n      }\n    }\n\n    // ── CUSTOM REPLY — réponses automatiques personnalisées ─────────────`;

  const count = handler.split(anchor).length - 1;
  if (count !== 1) {
    throw new Error(`[category-menu] point d'insertion attendu 1 fois, trouvé ${count}`);
  }

  handler = handler.replace(anchor, replacement);
  fs.writeFileSync(handlerPath, handler);
  console.log('[category-menu] route directe installée');
} else {
  console.log('[category-menu] route directe déjà présente');
}

const check = spawnSync(process.execPath, ['--check', handlerPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[category-menu] handler invalide après installation: ${check.stderr || check.stdout}`);
}

console.log('[category-menu] ✅ handler prêt');
