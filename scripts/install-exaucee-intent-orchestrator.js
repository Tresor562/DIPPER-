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

// Les autres installateurs Exaucée ajoutent du code entre la création de `ids` et le
// Game Master. On ne dépend donc plus d'un bloc exact : on insère l'arbitrage juste
// après la déclaration `ids`, qui est la frontière stable du runtime.
const idsRe = /^(\s*)const ids = \{ sessionId, chatId, userId \};\s*$/m;
const idsMatch = src.match(idsRe);
if (!idsMatch) throw new Error('[intent-orchestrator] déclaration ids introuvable');
const indent = idsMatch[1] || '  ';

const arbitration = `${indent}const ids = { sessionId, chatId, userId };\n\n${indent}// ${MARKER}\n${indent}// 1) Actions explicites > documentation. Une demande d'exécution ne doit jamais\n${indent}// être capturée par la connaissance du bot.\n${indent}const commandIntent = parseCommandExecution(routed.text);\n${indent}if (commandIntent) {\n${indent}  const described = exaucee.botKnowledge?.describe?.(commandIntent.name);\n${indent}  const commandName = described?.name || commandIntent.name;\n${indent}  try {\n${indent}    await exaucee.commandBridge.execute(commandName, {\n${indent}      sock, msg, actor, botIsAdmin, extra, sender: userId, destructive: false\n${indent}    }, commandIntent.args);\n${indent}    exaucee.audit.write({ type: 'command_execute', chatId, userId, command: commandName, ok: true });\n${indent}  } catch (error) {\n${indent}    const code = String(error?.code || '');\n${indent}    let response;\n${indent}    if (code === 'EXAUCEE_COMMAND_NOT_FOUND') response = \`Je ne trouve pas la commande .\${commandIntent.name} dans le registre actuel de THE BIG DIPPER.\`;\n${indent}    else if (/OWNER|ADMIN|SUDO|PREMIUM|VIP|ACCESS|BOT_ADMIN|GROUP_ONLY|PRIVATE_ONLY/.test(code)) response = error.message || \`Tu n’as pas les permissions nécessaires pour .\${commandName}.\`;\n${indent}    else response = \`La commande .\${commandName} n’a pas pu être exécutée correctement.\`;\n${indent}    await sendExaucee(sock, exaucee, chatId, msg, response);\n${indent}    exaucee.audit.write({ type: 'command_execute', chatId, userId, command: commandName, ok: false, code, message: error?.message });\n${indent}  }\n${indent}  return true;\n${indent}}\n\n${indent}// 2) Identité du bot : réponse factuelle, pas une recherche approximative de commandes.\n${indent}if (isBotIdentityQuestion(routed.text)) {\n${indent}  const answer = \`Je suis Exaucée, l’assistante intelligente intégrée à *THE BIG DIPPER*. C’est le bot auquel je suis directement reliée.\`;\n${indent}  await sendExaucee(sock, exaucee, chatId, msg, answer);\n${indent}  if (!SENSITIVE_TEXT_RE.test(routed.text)) exaucee.memory.remember(ids, { type: 'episode', value: \`user: \${routed.text}\`, source: 'conversation' });\n${indent}  exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: 'bot-identity' });\n${indent}  return true;\n${indent}}\n\n${indent}// 3) Créateur : uniquement le profil autorisé, jamais d'inférence d'identité privée.\n${indent}if (isCreatorQuestion(routed.text)) {\n${indent}  const answer = sanitizeCreatorAnswer(answerCreatorQuestion(routed.text));\n${indent}  await sendExaucee(sock, exaucee, chatId, msg, answer);\n${indent}  if (!SENSITIVE_TEXT_RE.test(routed.text)) exaucee.memory.remember(ids, { type: 'episode', value: \`user: \${routed.text}\`, source: 'conversation' });\n${indent}  exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: 'creator-profile' });\n${indent}  return true;\n${indent}}`;

src = src.replace(idsRe, arbitration);

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
