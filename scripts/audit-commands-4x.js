'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const COMMANDS_ROOT = path.join(ROOT, 'commands');
const { loadCommands } = require('../utils/commandLoader');

const CANONICAL_CATEGORIES = new Set([
  '🤖 IA', '📥 Téléchargements', '⚙️ Gestion de groupe', '🛠️ Outils généraux',
  '🎮 Jeux & Fun', '🛡️ Protections', '🌸 Anime', '🔍 Recherche', '👑 Owner',
  '🔧 Configuration', '♛ sᴏᴜᴠᴇʀᴀɪɴᴇᴛᴇ́', '🔮 ᴀᴜᴛʀᴇs'
]);

function listFiles() {
  const out = [];
  for (const category of fs.readdirSync(COMMANDS_ROOT)) {
    const dir = path.join(COMMANDS_ROOT, category);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.js')) out.push(path.join(dir, file));
    }
  }
  return out.sort();
}

function readSource(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function result(status = 'PASS', notes = []) {
  return { status, notes: Array.isArray(notes) ? notes : [notes] };
}

const files = listFiles();
const rows = [];
const critical = [];
const commandMap = loadCommands(true);
const registered = new Map();

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const source = readSource(file);
  let exported;
  let syntaxOk = true;
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) syntaxOk = false;

  try {
    delete require.cache[require.resolve(file)];
    exported = require(file);
  } catch (err) {
    critical.push(`${rel}: chargement impossible: ${err.message}`);
    rows.push({ file: rel, command: '(module)', audit1: result('FAIL', err.message), audit2: result('SKIP'), audit3: result('SKIP'), audit4: result('SKIP') });
    continue;
  }

  const list = Array.isArray(exported) ? exported : [exported];
  const commands = list.filter(c => c && typeof c === 'object' && c.name && typeof c.execute === 'function');
  if (!commands.length) {
    rows.push({ file: rel, command: '(aucun export commande)', audit1: result(syntaxOk ? 'WARN' : 'FAIL', syntaxOk ? 'module utilitaire' : 'syntaxe invalide'), audit2: result('SKIP'), audit3: result('SKIP'), audit4: result('SKIP') });
    continue;
  }

  for (const cmd of commands) {
    const name = String(cmd.name || '').trim();
    const aliases = Array.isArray(cmd.aliases) ? cmd.aliases.map(String).map(v => v.trim()).filter(Boolean) : [];

    // AUDIT 1 — syntaxe, import, structure exécutable.
    const a1Notes = [];
    if (!syntaxOk) a1Notes.push('syntaxe invalide');
    if (!name) a1Notes.push('name vide');
    if (typeof cmd.execute !== 'function') a1Notes.push('execute absent');
    const audit1 = result(a1Notes.length ? 'FAIL' : 'PASS', a1Notes);

    // AUDIT 2 — routing, aliases, catégorie, permissions, arguments/usage.
    const a2Notes = [];
    if (cmd.aliases != null && !Array.isArray(cmd.aliases)) a2Notes.push('aliases non-tableau');
    if (new Set(aliases.map(a => a.toLowerCase())).size !== aliases.length) a2Notes.push('alias dupliqué dans la commande');
    if (!cmd.category) a2Notes.push('catégorie absente');
    else if (!CANONICAL_CATEGORIES.has(cmd.category)) a2Notes.push(`catégorie non canonique: ${cmd.category}`);
    for (const flag of ['groupOnly','adminOnly','ownerOnly','botAdminNeeded','sudoOnly','premiumOnly']) {
      if (cmd[flag] != null && typeof cmd[flag] !== 'boolean') a2Notes.push(`${flag} non booléen`);
    }
    if (!cmd.usage) a2Notes.push('usage absent');
    const audit2 = result(a2Notes.some(n => /non-tableau|non booléen/.test(n)) ? 'FAIL' : a2Notes.length ? 'WARN' : 'PASS', a2Notes);

    // AUDIT 3 — réseau/médias/fichiers/timeouts/gestion d'erreurs (statique).
    const a3Notes = [];
    const usesNetwork = /axios\.|\bfetch\(|node-fetch|https?\.request|ytdl|yt-search|scraper/i.test(source);
    const usesMedia = /downloadMediaMessage|ffmpeg|sharp\(|canvas|sticker|audio|video|image/i.test(source);
    const usesFsWrite = /writeFile|writeFileSync|createWriteStream|mkdtemp|tmp|temp/i.test(source);
    const hasTimeout = /timeout\s*:|AbortController|Promise\.race|setTimeout/i.test(source);
    const hasErrorHandling = /try\s*\{|\.catch\s*\(|catch\s*\(/i.test(source);
    if (usesNetwork && !hasTimeout) a3Notes.push('réseau sans timeout explicite détecté');
    if ((usesNetwork || usesMedia || usesFsWrite) && !hasErrorHandling) a3Notes.push('I/O sans gestion d’erreur explicite détectée');
    if (usesFsWrite && !/unlink|rm\(|rmSync|cleanup|finally/i.test(source)) a3Notes.push('écriture temporaire sans nettoyage évident');
    const audit3 = result(a3Notes.length ? 'WARN' : 'PASS', a3Notes);

    // AUDIT 4 — cohérence réelle avec commandLoader/handler et collisions.
    const a4Notes = [];
    const loadedByName = commandMap.get(name.toLowerCase()) || commandMap.get(name);
    if (!loadedByName) a4Notes.push('nom non résolu par commandLoader');
    else if (loadedByName.name !== cmd.name) a4Notes.push(`nom routé vers ${loadedByName.name}`);
    for (const alias of aliases) {
      const target = commandMap.get(alias.toLowerCase()) || commandMap.get(alias);
      if (target && target.name !== cmd.name) a4Notes.push(`alias ${alias} routé vers ${target.name}`);
    }

    const tokens = [name, ...aliases].map(v => v.toLowerCase());
    for (const token of tokens) {
      const prev = registered.get(token);
      if (prev && prev !== name) a4Notes.push(`collision ${token} avec ${prev}`);
      else registered.set(token, name);
    }
    const audit4 = result(a4Notes.length ? 'FAIL' : 'PASS', a4Notes);

    for (const [idx, audit] of [audit1,audit2,audit3,audit4].entries()) {
      if (audit.status === 'FAIL') critical.push(`${name} audit${idx + 1}: ${audit.notes.join('; ')}`);
    }

    rows.push({ file: rel, command: name, audit1, audit2, audit3, audit4 });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  files: files.length,
  commands: rows.filter(r => !r.command.startsWith('(')).length,
  critical,
  rows,
};

fs.writeFileSync(path.join(ROOT, 'command-audit-report.json'), JSON.stringify(report, null, 2));

console.log(`[audit-commands-4x] ${report.files} fichiers, ${report.commands} commandes.`);
for (const row of rows) {
  if (row.command.startsWith('(')) continue;
  console.log(`[4X] ${row.command} | A1:${row.audit1.status} | A2:${row.audit2.status} | A3:${row.audit3.status} | A4:${row.audit4.status}`);
  for (const [i, a] of [row.audit1,row.audit2,row.audit3,row.audit4].entries()) {
    if (a.notes.length) console.log(`     A${i+1}: ${a.notes.join('; ')}`);
  }
}

if (critical.length) {
  console.error(`[audit-commands-4x] ❌ ${critical.length} problème(s) critique(s).`);
  for (const item of critical) console.error(` - ${item}`);
  process.exit(1);
}

const warnings = rows.reduce((n, r) => n + [r.audit1,r.audit2,r.audit3,r.audit4].filter(a => a.status === 'WARN').length, 0);
console.log(`[audit-commands-4x] ✅ 4 audits terminés, ${warnings} avertissement(s) non bloquant(s).`);
