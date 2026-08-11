'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const COMMANDS = path.join(ROOT, 'commands');

function commandFiles() {
  if (!fs.existsSync(COMMANDS)) throw new Error(`Dossier commands absent: ${COMMANDS}`);
  const files = [];
  for (const category of fs.readdirSync(COMMANDS)) {
    const categoryPath = path.join(COMMANDS, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;
    for (const file of fs.readdirSync(categoryPath)) {
      if (file.endsWith('.js')) files.push({ category, file, filePath: path.join(categoryPath, file) });
    }
  }
  return files;
}

const files = commandFiles();
const errors = [];
const warnings = [];
const names = new Map();
let commandCount = 0;

for (const entry of files) {
  const rel = path.relative(ROOT, entry.filePath);
  const syntax = spawnSync(process.execPath, ['--check', entry.filePath], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    errors.push(`${rel}: syntaxe invalide: ${(syntax.stderr || syntax.stdout).trim()}`);
    continue;
  }

  let exported;
  try {
    delete require.cache[require.resolve(entry.filePath)];
    exported = require(entry.filePath);
  } catch (err) {
    errors.push(`${rel}: chargement impossible: ${err.message}`);
    continue;
  }

  const list = Array.isArray(exported) ? exported : [exported];
  let found = 0;
  for (const command of list) {
    if (!command || typeof command !== 'object' || !command.name || typeof command.execute !== 'function') continue;
    found++;
    commandCount++;

    const canonical = String(command.name).trim();
    if (!canonical) {
      errors.push(`${rel}: nom de commande vide`);
      continue;
    }

    if (names.has(canonical) && names.get(canonical) !== rel) {
      errors.push(`${rel}: nom '${canonical}' déjà déclaré dans ${names.get(canonical)}`);
    } else {
      names.set(canonical, rel);
    }

    if (command.aliases != null && !Array.isArray(command.aliases)) {
      errors.push(`${rel}: aliases de '${canonical}' doit être un tableau`);
      continue;
    }

    for (const rawAlias of command.aliases || []) {
      const alias = String(rawAlias || '').trim();
      if (!alias) continue;
      if (names.has(alias) && names.get(alias) !== rel) {
        errors.push(`${rel}: alias '${alias}' de '${canonical}' collisionne avec ${names.get(alias)}`);
      } else {
        names.set(alias, rel);
      }
    }
  }

  if (found === 0) warnings.push(`${rel}: aucun export commande (name + execute)`);
}

console.log(`[validate-commands] ${files.length} fichiers inspectés, ${commandCount} commandes valides.`);
for (const warning of warnings) console.warn(`[validate-commands] ⚠️ ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`[validate-commands] ❌ ${error}`);
  console.error(`[validate-commands] ÉCHEC: ${errors.length} erreur(s).`);
  process.exit(1);
}

console.log('[validate-commands] ✅ syntaxe, chargement, exports et collisions validés.');
process.exit(0);
