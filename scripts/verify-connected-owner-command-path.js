'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const indexPath = path.join(ROOT, 'index.js');
const sessionManagerPath = path.join(ROOT, 'utils', 'sessionManager.js');
const commandsDir = path.join(ROOT, 'commands');

for (const file of [handlerPath, indexPath, sessionManagerPath]) {
  if (!fs.existsSync(file)) throw new Error(`[owner-command-audit] fichier absent: ${path.relative(ROOT, file)}`);
}
if (!fs.existsSync(commandsDir)) throw new Error('[owner-command-audit] dossier commands absent');

const handler = fs.readFileSync(handlerPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
const sessionManager = fs.readFileSync(sessionManagerPath, 'utf8');

function requireInvariant(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`[owner-command-audit] invariant absent: ${label}`);
}

requireInvariant(index, "type !== 'notify' && type !== 'append'", 'bot principal accepte notify + append');
requireInvariant(index, "type === 'append' && !msg.key.fromMe", 'bot principal filtre append non-fromMe');
requireInvariant(sessionManager, "type !== 'notify' && type !== 'append'", 'sous-session accepte notify + append');
requireInvariant(sessionManager, "type === 'append' && !msg.key.fromMe", 'sous-session filtre append non-fromMe');
requireInvariant(sessionManager, 'sock._sessionPhoneNumber', 'owner local injecté');

requireInvariant(handler, 'const _isSessionOwner', 'détection owner local');
requireInvariant(handler, 'msg.key.fromMe || _isSessionOwner', 'fromMe inclus dans isMe');
requireInvariant(handler, 'isOwner:        isMe', 'isOwner propagé aux commandes');
requireInvariant(handler, 'commandResponseStorage.run(', 'watchdog réponse central');
requireInvariant(handler, '[NO SILENT noReply]', 'noReply ne peut plus créer de silence');
requireInvariant(handler, 'sendCommandFeedback(', 'fallback réponse disponible');
requireInvariant(handler, 'command.execute(sock, msg, args, extra)', 'dispatch commun execute');

function listJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function executeBlocksFromMe(executeFn) {
  const source = Function.prototype.toString.call(executeFn);
  return /if\s*\(\s*(?:msg\??\.key\??\.)?fromMe\s*\)\s*(?:return\b|\{\s*return\b)/m.test(source) ||
    /if\s*\(\s*msg\??\.key\??\.fromMe\s*===\s*true\s*\)\s*(?:return\b|\{\s*return\b)/m.test(source);
}

const files = listJs(commandsDir);
const commands = [];
const loadErrors = [];
const ownerSelfBlockers = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 15000 });
  if (syntax.error) {
    loadErrors.push(`${rel}: verification syntaxe impossible (${syntax.error.message})`);
    continue;
  }
  if (syntax.status !== 0) {
    loadErrors.push(`${rel}: syntaxe invalide`);
    continue;
  }

  let exported;
  try {
    delete require.cache[require.resolve(file)];
    exported = require(file);
  } catch (err) {
    loadErrors.push(`${rel}: ${err.message}`);
    continue;
  }

  for (const command of (Array.isArray(exported) ? exported : [exported])) {
    if (!command || typeof command !== 'object' || !command.name || typeof command.execute !== 'function') continue;

    if (executeBlocksFromMe(command.execute)) {
      ownerSelfBlockers.push(`${rel}#${command.name}`);
    }

    commands.push({
      name: String(command.name),
      file: rel,
      groupOnly: !!command.groupOnly,
      privateOnly: !!command.privateOnly,
      botAdminNeeded: !!command.botAdminNeeded,
      ownerOnly: !!command.ownerOnly,
      aliases: Array.isArray(command.aliases) ? command.aliases.map(String) : [],
    });
  }
}

if (loadErrors.length) throw new Error('[owner-command-audit] commandes non chargeables:\n' + loadErrors.join('\n'));
if (!commands.length) throw new Error('[owner-command-audit] aucune commande valide');
if (ownerSelfBlockers.length) {
  throw new Error('[owner-command-audit] commandes bloquant fromMe dans execute():\n' + ownerSelfBlockers.join('\n'));
}

const canonical = new Set(commands.map(c => c.name.toLowerCase()));
if (canonical.size !== commands.length) {
  const byName = new Map();
  for (const command of commands) {
    const key = command.name.toLowerCase();
    const list = byName.get(key) || [];
    list.push(command.file);
    byName.set(key, list);
  }
  const duplicates = [...byName.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([name, list]) => `${name}: ${list.join(', ')}`);
  throw new Error('[owner-command-audit] noms canoniques dupliqués:\n' + duplicates.join('\n'));
}

const aliasCount = commands.reduce((sum, command) => sum + command.aliases.length, 0);
const report = {
  generatedAt: new Date().toISOString(),
  commandFiles: files.length,
  commandCount: commands.length,
  canonicalCount: canonical.size,
  aliasCount,
  ownerSelfBlockers,
  connectedOwnerPath: {
    mainNotifyAndAppend: true,
    pairedNotifyAndAppend: true,
    fromMeRecognizedAsOwner: true,
    localSessionOwnerRecognized: true,
    responseWatchdog: true,
    noSilentNoReply: true,
  },
  commands,
};
fs.writeFileSync(path.join(ROOT, 'connected-owner-command-audit.json'), JSON.stringify(report, null, 2));

console.log(`[owner-command-audit] ✅ ${commands.length} commandes canoniques + ${aliasCount} alias (${files.length} fichiers)`);
console.log('[owner-command-audit] ✅ owner connecté reconnu sur bot principal et sous-sessions');
console.log('[owner-command-audit] ✅ aucune fonction execute() ne bloque explicitement fromMe');
console.log('[owner-command-audit] ✅ watchdog anti-silence actif pour chaque dispatch classique');

process.exit(0);
