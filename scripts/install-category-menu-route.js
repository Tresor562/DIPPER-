'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const menuPath = path.join(ROOT, 'commands', 'general_tools', 'menu.js');
const marker = '[CATEGORY MENU PHRASE]';
const allMenuMarker = "'allmenu'";

// `allmenu` faisait partie de l'interface historique du menu. Le restaurer
// comme simple alias du même module évite une deuxième implémentation et
// conserve exactement les mêmes permissions/rendu/navigation que `.menu`.
let menu = fs.readFileSync(menuPath, 'utf8');
if (!menu.includes(allMenuMarker)) {
  const aliasAnchor = "  aliases: ['commands','menu','index','m','ɢʀɪᴍᴏɪʀᴇ',";
  const aliasReplacement = "  aliases: ['commands','menu','allmenu','index','m','ɢʀɪᴍᴏɪʀᴇ',";
  const aliasCount = menu.split(aliasAnchor).length - 1;
  if (aliasCount !== 1) {
    throw new Error(`[category-menu] alias menu attendu 1 fois, trouvé ${aliasCount}`);
  }
  menu = menu.replace(aliasAnchor, aliasReplacement);
  fs.writeFileSync(menuPath, menu);
  console.log('[category-menu] alias allmenu restauré');
} else {
  console.log('[category-menu] alias allmenu déjà présent');
}

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

for (const file of [handlerPath, menuPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[category-menu] ${path.relative(ROOT, file)} invalide après installation: ${check.stderr || check.stdout}`);
  }
}

const finalMenu = fs.readFileSync(menuPath, 'utf8');
if (!finalMenu.includes("aliases: ['commands','menu','allmenu'")) {
  throw new Error('[category-menu] alias allmenu absent après installation');
}

console.log('[category-menu] ✅ handler + menu prêts');
