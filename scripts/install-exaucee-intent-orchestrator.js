'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const runtimePath = path.join(ROOT, 'ai_chat', 'runtime.js');
const MARKER = '[EXAUCEE INTENT ORCHESTRATOR V1]';
let src = fs.readFileSync(runtimePath, 'utf8');

if (src.includes(MARKER)) {
  console.log('[install-exaucee-intent-orchestrator] déjà appliqué');
  process.exit(0);
}

const importAnchor = "const { createExaucee } = require('./core');";
if (!src.includes(importAnchor)) throw new Error('[intent-orchestrator] import core introuvable');
src = src.replace(importAnchor, `${importAnchor}\nconst { parseCommandExecution, isCreatorQuestion, isBotIdentityQuestion } = require('./cognition/intentOrchestrator');\nconst { publicCreatorContext, answerCreatorQuestion, sanitizeCreatorAnswer } = require('./knowledge/creatorProfile');`);

const idsAnchor = `  const ids = { sessionId, chatId, userId };\n\n  if (await handleGameMaster(exaucee, { sock, msg, chatId, userId, text: routed.text })) return true;`;
if (!src.includes(idsAnchor)) throw new Error('[intent-orchestrator] ancre ids/game introuvable');

const arbitration = `  const ids = { sessionId, chatId, userId };\n\n  // ${MARKER}\n  // 1) Actions explicites > documentation. Une demande d'exécution ne doit jamais\n  // être capturée par la connaissance du bot.\n  const commandIntent = parseCommandExecution(routed.text);\n  if (commandIntent) {\n    const described = exaucee.botKnowledge?.describe?.(commandIntent.name);\n    const commandName = described?.name || commandIntent.name;\n    try {\n      await exaucee.commandBridge.execute(commandName, {\n        sock, msg, actor, botIsAdmin, extra, sender: userId, destructive: false\n      }, commandIntent.args);\n      exaucee.audit.write({ type: 'command_execute', chatId, userId, command: commandName, ok: true });\n    } catch (error) {\n      const code = String(error?.code || '');\n      let response;\n      if (code === 'EXAUCEE_COMMAND_NOT_FOUND') response = \`Je ne trouve pas la commande .\${commandIntent.name} dans le registre actuel de THE BIG DIPPER.\`;\n      else if (/OWNER|ADMIN|SUDO|PREMIUM|VIP|ACCESS|BOT_ADMIN|GROUP_ONLY|PRIVATE_ONLY/.test(code)) response = error.message || \`Tu n’as pas les permissions nécessaires pour .\${commandName}.\`;\n      else response = \`La commande .\${commandName} n’a pas pu être exécutée correctement.\`;\n      await sendExaucee(sock, exaucee, chatId, msg, response);\n      exaucee.audit.write({ type: 'command_execute', chatId, userId, command: commandName, ok: false, code, message: error?.message });\n    }\n    return true;\n  }\n\n  // 2) Identité du bot : réponse factuelle, pas une recherche approximative de commandes.\n  if (isBotIdentityQuestion(routed.text)) {\n    const answer = \`Je suis Exaucée, l’assistante intelligente intégrée à *THE BIG DIPPER*. C’est le bot auquel je suis directement reliée.\`;\n    await sendExaucee(sock, exaucee, chatId, msg, answer);\n    if (!SENSITIVE_TEXT_RE.test(routed.text)) exaucee.memory.remember(ids, { type: 'episode', value: \`user: \${routed.text}\`, source: 'conversation' });\n    exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: 'bot-identity' });\n    return true;\n  }\n\n  // 3) Créateur : uniquement le profil autorisé, jamais d'inférence d'identité privée.\n  if (isCreatorQuestion(routed.text)) {\n    const answer = sanitizeCreatorAnswer(answerCreatorQuestion(routed.text));\n    await sendExaucee(sock, exaucee, chatId, msg, answer);\n    if (!SENSITIVE_TEXT_RE.test(routed.text)) exaucee.memory.remember(ids, { type: 'episode', value: \`user: \${routed.text}\`, source: 'conversation' });\n    exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: 'creator-profile' });\n    return true;\n  }\n\n  if (await handleGameMaster(exaucee, { sock, msg, chatId, userId, text: routed.text })) return true;`;
src = src.replace(idsAnchor, arbitration);

// Le profil public est disponible au raisonnement pour les suivis implicites comme « et ses projets ? ».
const knowledgeAnchor = `  const botKnowledgeContext = exaucee.botKnowledge?.buildContext?.(routed.text, {`;
if (src.includes(knowledgeAnchor)) {
  src = src.replace(knowledgeAnchor, `  messages.splice(Math.max(1, messages.length - 1), 0, { role: 'system', content: publicCreatorContext() });\n\n${knowledgeAnchor}`);
}

// Filtre de sortie supplémentaire : même un fournisseur externe ne doit pas compléter l'identité.
src = src.replace(/answer = sanitizeModelText\(result\.text\)\.trim\(\);/g, `answer = sanitizeCreatorAnswer(sanitizeModelText(result.text)).trim();`);
src = src.replace(/await sendExaucee\(sock, exaucee, chatId, msg, answer\.slice\(0, 12000\)\);/g, `answer = sanitizeCreatorAnswer(answer);\n  await sendExaucee(sock, exaucee, chatId, msg, answer.slice(0, 12000));`);

fs.writeFileSync(runtimePath, src, 'utf8');
const check = spawnSync(process.execPath, ['--check', runtimePath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`[intent-orchestrator] runtime invalide: ${check.stderr || check.stdout}`);
console.log('[install-exaucee-intent-orchestrator] ✅ actions, bot identity, creator privacy et arbitrage installés');
