'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const menuPath = path.join(ROOT, 'commands', 'general_tools', 'menu.js');
const marker = '[CATEGORY MENU PHRASE]';

function findMenuAliasesRegion(source) {
  const exportStart = source.indexOf('module.exports = {');
  if (exportStart < 0) throw new Error('[category-menu] module.exports du menu introuvable');

  const aliasesKey = source.indexOf('aliases:', exportStart);
  if (aliasesKey < 0) throw new Error('[category-menu] tableau aliases du menu introuvable');

  const open = source.indexOf('[', aliasesKey);
  if (open < 0) throw new Error('[category-menu] ouverture du tableau aliases introuvable');

  const close = source.indexOf(']', open);
  if (close < 0) throw new Error('[category-menu] fermeture du tableau aliases introuvable');

  return { open, close, body: source.slice(open + 1, close) };
}

function hasAllMenuAlias(source) {
  const region = findMenuAliasesRegion(source);
  return /['"]allmenu['"]/.test(region.body);
}

// `allmenu` fait partie de l'interface historique du menu. On l'installe
// directement dans module.exports.aliases, sans se fier à une occurrence du
// mot ailleurs dans le fichier ni à une mise en forme particulière.
let menu = fs.readFileSync(menuPath, 'utf8');
if (!hasAllMenuAlias(menu)) {
  const { open } = findMenuAliasesRegion(menu);
  menu = menu.slice(0, open + 1) + "'allmenu'," + menu.slice(open + 1);
  fs.writeFileSync(menuPath, menu);
  console.log('[category-menu] alias allmenu restauré dans module.exports.aliases');
} else {
  console.log('[category-menu] alias allmenu déjà présent dans module.exports.aliases');
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
if (!hasAllMenuAlias(finalMenu)) {
  throw new Error('[category-menu] alias allmenu absent de module.exports.aliases après installation');
}

console.log('[category-menu] ✅ handler + menu prêts');
