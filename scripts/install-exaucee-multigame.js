'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const corePath = path.join(ROOT, 'ai_chat', 'core', 'index.js');
const runtimePath = path.join(ROOT, 'ai_chat', 'runtime.js');
const MARKER = '[EXAUCEE MULTIGAME V2]';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`[exaucee-multigame] ancre introuvable: ${label}`);
  return source.replace(from, to);
}

let core = fs.readFileSync(corePath, 'utf8');
if (!core.includes('AdvancedGameMaster')) {
  core = replaceOnce(core,
    "const { GameMaster } = require('../games/gameMaster');",
    "const { AdvancedGameMaster } = require('../games/advancedGameMaster');",
    'GameMaster require');
  core = replaceOnce(core,
    "const gameMaster = options.gameMaster || new GameMaster({ file: path.join(root, 'sessions', sessionId, 'games.json') });",
    "const gameMaster = options.gameMaster || new AdvancedGameMaster({ file: path.join(root, 'sessions', sessionId, 'games.json') });",
    'GameMaster constructor');
  fs.writeFileSync(corePath, core, 'utf8');
}

let runtime = fs.readFileSync(runtimePath, 'utf8');
if (!runtime.includes(MARKER)) {
  runtime = replaceOnce(runtime,
    "const { createExaucee } = require('./core');",
    "const { createExaucee } = require('./core');\nconst { handleAdvancedGames } = require('./games/advancedRuntime');\nconst { executeWorkflow, parseWorkflowIntent } = require('./dynamic/workflowEngine'); // " + MARKER,
    'runtime imports');

  const oldDynamic = `async function executeDynamic(exaucee, sessionId, text, chatId, sock, msg) {\n  const first = String(text || '').trim().split(/\\s+/)[0].replace(/^[.!/]/, '').toLowerCase();\n  if (!first) return false;\n  const record = exaucee.dynamicCommands.get(sessionId, first, { groupId: chatId.endsWith('@g.us') ? chatId : null });\n  if (!record) return false;\n  if (record.workflow?.type === 'reply') {\n    await sendExaucee(sock, exaucee, chatId, msg, record.workflow.text || '');\n    return true;\n  }\n  return false;\n}`;

  const newDynamic = `async function executeDynamic(exaucee, sessionId, text, chatId, sock, msg) {\n  const parts = String(text || '').trim().split(/\\s+/);\n  const first = String(parts.shift() || '').replace(/^[.!/]/, '').toLowerCase();\n  if (!first) return false;\n  const record = exaucee.dynamicCommands.get(sessionId, first, { groupId: chatId.endsWith('@g.us') ? chatId : null });\n  if (!record) return false;\n  const result = await executeWorkflow(record.workflow, {\n    chatId,\n    userId: actorJid(msg),\n    userName: msg?.pushName || '',\n    args: parts,\n    send: value => sendExaucee(sock, exaucee, chatId, msg, value)\n  });\n  return Boolean(result?.handled);\n}`;
  runtime = replaceOnce(runtime, oldDynamic, newDynamic, 'executeDynamic');

  const hookAnchor = `  const ids = { sessionId, chatId, userId };\n\n  if (await handleGameMaster(exaucee, { sock, msg, chatId, userId, text: routed.text })) return true;`;
  const hookReplacement = `  const ids = { sessionId, chatId, userId };\n\n  if (await handleAdvancedGames(exaucee, {\n    sock, msg, chatId, userId, text: routed.text,\n    send: value => sendExaucee(sock, exaucee, chatId, msg, value)\n  })) return true;\n\n  if (await handleGameMaster(exaucee, { sock, msg, chatId, userId, text: routed.text })) return true;`;
  runtime = replaceOnce(runtime, hookAnchor, hookReplacement, 'advanced game hook');

  const dynamicAnchor = `  const dynamic = parseDynamicReply(routed.text);\n  if (dynamic && (actor.isOwner || actor.isSuperMe || actor.isAdmin)) {`;
  const dynamicReplacement = `  const workflowIntent = parseWorkflowIntent(routed.text);\n  if (workflowIntent && (actor.isOwner || actor.isSuperMe || actor.isAdmin)) {\n    const staticCommands = global.commands || new Map();\n    if (staticCommands.has(workflowIntent.name)) {\n      await sendExaucee(sock, exaucee, chatId, msg, 'Cette commande existe déjà dans THE BIG DIPPER. Je ne la remplacerai pas.');\n      return true;\n    }\n    exaucee.dynamicCommands.define(sessionId, {\n      name: workflowIntent.name,\n      groupId: chatId.endsWith('@g.us') ? chatId : null,\n      workflow: workflowIntent.workflow\n    });\n    await sendExaucee(sock, exaucee, chatId, msg, 'C’est fait. Le workflow .' + workflowIntent.name + ' est prêt ici.');\n    return true;\n  }\n\n  const dynamic = parseDynamicReply(routed.text);\n  if (dynamic && (actor.isOwner || actor.isSuperMe || actor.isAdmin)) {`;
  runtime = replaceOnce(runtime, dynamicAnchor, dynamicReplacement, 'workflow intent');

  runtime = runtime.replace(
    `*Question 1/\${started.game.totalRounds}*\\n\${started.question}`,
    `*Question 1/\${started.game.totalRounds} — Quiz #\${started.game.alias}*\\n\${started.question}`
  );
  runtime = runtime.replace(
    `🎭 *Action ou Vérité lancé !*\\nÉcris *action* ou *vérité* en répondant à ce message. Je m’occupe des tours 🌸`,
    `🎭 *Action ou Vérité #\${game.alias} lancé !*\\nÉcris *action* ou *vérité*. Si plusieurs parties tournent, ajoute #\${game.alias}. 🌸`
  );

  fs.writeFileSync(runtimePath, runtime, 'utf8');
}

for (const file of [corePath, runtimePath]) {
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(`[exaucee-multigame] syntaxe invalide ${path.relative(ROOT, file)}: ${checked.stderr || checked.stdout}`);
}

// V3 s'installe après la V2 pour réutiliser ses hooks sans casser les jeux existants.
require('./install-exaucee-mega-gamemaster');
console.log('[exaucee-multigame] ✅ multi-parties V2 + workflows dynamiques + Mega GameMaster V3 installés');
