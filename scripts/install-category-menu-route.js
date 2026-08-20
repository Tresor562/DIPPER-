'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const menuPath = path.join(ROOT, 'commands', 'general_tools', 'menu.js');
const allMenuPath = path.join(ROOT, 'commands', 'general_tools', 'allmenu.js');
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

function removeAllMenuAlias(source) {
  const { open, close, body } = findMenuAliasesRegion(source);
  const next = body
    .replace(/\s*['"]allmenu['"]\s*,?/g, '')
    .replace(/^\s*,|,\s*$/g, '');
  return source.slice(0, open + 1) + next + source.slice(close);
}

// Depuis style-menu-v2, `.allmenu` est une commande canonique séparée.
// Le grimoire/menu historique ne doit donc plus revendiquer cet alias.
let menu = fs.readFileSync(menuPath, 'utf8');
if (fs.existsSync(allMenuPath)) {
  if (hasAllMenuAlias(menu)) {
    menu = removeAllMenuAlias(menu);
    fs.writeFileSync(menuPath, menu, 'utf8');
    console.log('[category-menu] alias allmenu retiré du menu historique; commande dédiée active');
  } else {
    console.log('[category-menu] commande allmenu dédiée déjà propriétaire de son nom');
  }
} else if (!hasAllMenuAlias(menu)) {
  const { open } = findMenuAliasesRegion(menu);
  menu = menu.slice(0, open + 1) + "'allmenu'," + menu.slice(open + 1);
  fs.writeFileSync(menuPath, menu, 'utf8');
  console.log('[category-menu] compatibilité legacy: alias allmenu restauré');
}

let handler = fs.readFileSync(handlerPath, 'utf8');
if (!handler.includes(marker)) {
  const anchor = '    // ── CUSTOM REPLY — réponses automatiques personnalisées ─────────────';
  const replacement = `    // ── [CATEGORY MENU PHRASE] ───────────────────────────────\n    // Navigation du menu : accepte \"Groupe Menu\", \"Download Menu\", etc.\n    // Cette branche affiche seulement les commandes d'une catégorie ; elle\n    // n'exécute aucune commande et ne modifie donc pas leurs permissions.\n    if (body) {\n      try {\n        const { handleCategoryMenuPhrase } = require('./utils/categoryMenu');\n        if (await handleCategoryMenuPhrase(sock, msg, { from }, body, config.prefix)) return;\n      } catch (err) {\n        console.error('[category-menu]', err.message);\n      }\n    }\n\n    // ── CUSTOM REPLY — réponses automatiques personnalisées ─────────────`;
  const count = handler.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[category-menu] point d'insertion attendu 1 fois, trouvé ${count}`);
  handler = handler.replace(anchor, replacement);
  fs.writeFileSync(handlerPath, handler, 'utf8');
  console.log('[category-menu] route directe installée');
} else {
  console.log('[category-menu] route directe déjà présente');
}

for (const file of [handlerPath, menuPath, ...(fs.existsSync(allMenuPath) ? [allMenuPath] : [])]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[category-menu] ${path.relative(ROOT, file)} invalide après installation: ${check.stderr || check.stdout}`);
}

const finalMenu = fs.readFileSync(menuPath, 'utf8');
if (fs.existsSync(allMenuPath) && hasAllMenuAlias(finalMenu)) {
  throw new Error('[category-menu] collision allmenu: alias historique encore présent malgré la commande dédiée');
}
if (!fs.existsSync(allMenuPath) && !hasAllMenuAlias(finalMenu)) {
  throw new Error('[category-menu] alias allmenu legacy absent sans commande dédiée');
}

console.log('[category-menu] ✅ handler + propriété allmenu cohérente');
