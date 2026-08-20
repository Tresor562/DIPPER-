'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const files = {
  menu: path.join(ROOT, 'commands', 'general_tools', 'menu.js'),
  fileLab: path.join(ROOT, 'commands', 'file_lab', 'file_lab.js'),
  groupSettings: path.join(ROOT, 'commands', 'group_management', 'groupsettings.js'),
};

for (const [label, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`[alias-ownership] ${label} absent: ${file}`);
}

function writeIfChanged(file, before, after, label) {
  if (before === after) {
    console.log(`[alias-ownership] ${label} déjà conforme`);
    return;
  }
  fs.writeFileSync(file, after, 'utf8');
  console.log(`[alias-ownership] ${label} corrigé`);
}

// allmenu appartient au module canonique commands/general_tools/allmenu.js.
// Le menu historique/grimoire ne doit plus revendiquer cet alias.
{
  const file = files.menu;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  const exportStart = after.indexOf('module.exports = {');
  if (exportStart < 0) throw new Error('[alias-ownership] module.exports du menu introuvable');
  const aliasesKey = after.indexOf('aliases:', exportStart);
  const open = aliasesKey >= 0 ? after.indexOf('[', aliasesKey) : -1;
  const close = open >= 0 ? after.indexOf(']', open) : -1;
  if (aliasesKey < 0 || open < 0 || close < 0) throw new Error('[alias-ownership] aliases du menu introuvables');
  const body = after.slice(open + 1, close)
    .replace(/\s*['"]allmenu['"]\s*,?/g, '')
    .replace(/^\s*,|,\s*$/g, '');
  after = after.slice(0, open + 1) + body + after.slice(close);
  writeIfChanged(file, before, after, 'alias allmenu réservé au module allmenu');
}

// topdf appartient à texttopdf et mp3 appartient à tomp3.
{
  const file = files.fileLab;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  after = after.replace("aliases:name==='filemp3'?['mp3']:[]", 'aliases:[]');
  after = after.replace("usage:name==='filemp3'?'.mp3':`.${name}`", 'usage:`.${name}`');
  after = after.replace("aliases:['image2pdf','topdf']", "aliases:['image2pdf']");
  if (/name:'filemp3'[\s\S]{0,180}aliases:name==='filemp3'\?\['mp3'\]/.test(after)) {
    throw new Error('[alias-ownership] alias mp3 File Lab encore présent');
  }
  if (/name:'img2pdf'[\s\S]{0,100}['"]topdf['"]/.test(after)) {
    throw new Error('[alias-ownership] alias topdf File Lab encore présent');
  }
  writeIfChanged(file, before, after, 'aliases File Lab mp3/topdf');
}

// groupname appartient à la commande de lecture commands/general_tools/groupname.js.
// setgroupname reste la commande de modification explicite.
{
  const file = files.groupSettings;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  after = after.replace(/aliases:\s*\[\s*['"]groupname['"]\s*,\s*['"]setnom['"]\s*,\s*['"]renamegroup['"]\s*\]/, "aliases: ['setnom', 'renamegroup']");
  if (/name:\s*['"]setgroupname['"][\s\S]{0,160}aliases:\s*\[[^\]]*['"]groupname['"]/.test(after)) {
    throw new Error('[alias-ownership] alias groupname de setgroupname encore présent');
  }
  writeIfChanged(file, before, after, 'alias groupname réservé au getter');
}

for (const file of Object.values(files)) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[alias-ownership] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
}

console.log('[alias-ownership] ✅ allmenu/topdf/groupname/mp3 ont chacun un propriétaire canonique unique');
