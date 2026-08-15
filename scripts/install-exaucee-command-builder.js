'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const runtimePath = path.join(ROOT, 'ai_chat', 'runtime.js');
const MARKER = '[EXAUCEE COMMAND BUILDER V3]';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`[exaucee-command-builder] ancre introuvable: ${label}`);
  return source.replace(from, to);
}

let runtime = fs.readFileSync(runtimePath, 'utf8');
if (!runtime.includes(MARKER)) {
  runtime = replaceOnce(
    runtime,
    "const { executeWorkflow, parseWorkflowIntent } = require('./dynamic/workflowEngine'); // [EXAUCEE MULTIGAME V2]",
    "const { executeWorkflow } = require('./dynamic/workflowEngine'); // [EXAUCEE MULTIGAME V2]\nconst { compileCommandIntent } = require('./dynamic/commandBuilder'); // " + MARKER,
    'dynamic imports'
  );

  const oldBlock = `  const workflowIntent = parseWorkflowIntent(routed.text);\n  if (workflowIntent && (actor.isOwner || actor.isSuperMe || actor.isAdmin)) {\n    const staticCommands = global.commands || new Map();\n    if (staticCommands.has(workflowIntent.name)) {\n      await sendExaucee(sock, exaucee, chatId, msg, 'Cette commande existe déjà dans THE BIG DIPPER. Je ne la remplacerai pas.');\n      return true;\n    }\n    exaucee.dynamicCommands.define(sessionId, {\n      name: workflowIntent.name,\n      groupId: chatId.endsWith('@g.us') ? chatId : null,\n      workflow: workflowIntent.workflow\n    });\n    await sendExaucee(sock, exaucee, chatId, msg, 'C’est fait. Le workflow .' + workflowIntent.name + ' est prêt ici.');\n    return true;\n  }`;

  const newBlock = `  if (actor.isOwner || actor.isSuperMe || actor.isAdmin) {\n    const staticCommands = global.commands || new Map();\n    const aliases = new Set();\n    for (const cmd of staticCommands.values?.() || []) {\n      for (const alias of Array.isArray(cmd?.aliases) ? cmd.aliases : []) aliases.add(String(alias).toLowerCase());\n    }\n    const built = compileCommandIntent(routed.text, { staticCommands, aliases });\n    if (built.ok) {\n      try {\n        const record = exaucee.dynamicCommands.define(sessionId, {\n          name: built.spec.name,\n          groupId: chatId.endsWith('@g.us') ? chatId : null,\n          workflow: built.spec.workflow\n        });\n        await sendExaucee(sock, exaucee, chatId, msg, 'C’est prêt 🌸 .' + record.name + ' a été validée et enregistrée (v' + record.version + ').');\n      } catch (error) {\n        await sendExaucee(sock, exaucee, chatId, msg, 'Je n’ai pas enregistré cette commande : ' + String(error.message || error).slice(0, 300));\n      }\n      return true;\n    }\n    if (built.code && built.code !== 'NO_INTENT') {\n      await sendExaucee(sock, exaucee, chatId, msg, 'Je ne peux pas créer cette commande : ' + built.errors.join(', ') + '.');\n      return true;\n    }\n  }`;

  runtime = replaceOnce(runtime, oldBlock, newBlock, 'workflow creation block');
  fs.writeFileSync(runtimePath, runtime, 'utf8');
}

const checked = spawnSync(process.execPath, ['--check', runtimePath], { encoding: 'utf8' });
if (checked.status !== 0) throw new Error(`[exaucee-command-builder] syntaxe invalide runtime.js: ${checked.stderr || checked.stdout}`);

console.log('[exaucee-command-builder] ✅ Builder V3 installé: parsing naturel + validation + collisions');
