'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const runtimePath = path.join(root, 'ai_chat', 'runtime.js');
const MARKER = '[EXAUCEE COGNITIVE PIPELINE]';

function checkRuntime(label) {
  const check = spawnSync(process.execPath, ['--check', runtimePath], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[install-exaucee-cognition] ${label}: ${check.stderr || check.stdout || 'runtime invalide'}`);
  }
}

let src = fs.readFileSync(runtimePath, 'utf8');

// Idempotence : le préflight Render exécute les installateurs deux fois.
if (src.includes(MARKER)) {
  src = src.replace(/exaucee\.memory\.getContext\(ids\)/g, 'exaucee.memory.getRelevantContext(ids, routed.text)');
  src = src.replace(/exaucee\.ai\.complete\(\{\s*messages\s*\}\)/g, "exaucee.ai.complete({ messages, mode: analysis?.reasoningMode || 'normal' })");
  fs.writeFileSync(runtimePath, src);
  checkRuntime('runtime déjà patché invalide');
  console.log('[install-exaucee-cognition] déjà appliqué + mémoire pertinente + mode adaptatif vérifiés');
  process.exit(0);
}

const newBuild = `  // ${MARKER}\n  const memory = exaucee.memory.getRelevantContext(ids, routed.text);\n  const cognitiveContext = { isGroup: chatId.endsWith('@g.us'), userId, actor, botIsAdmin };\n  const analysis = exaucee.cognition.analyze(routed.text, memory, cognitiveContext);\n  const messages = exaucee.cognition.buildMessages({\n    persona: exaucee.persona,\n    memory,\n    analysis,\n    context: cognitiveContext\n  });\n  exaucee.audit.write({\n    type: 'cognition', chatId, userId,\n    intent: analysis.intent, tone: analysis.tone, language: analysis.language, reasoningMode: analysis.reasoningMode,\n    implicitReference: analysis.resolvedText !== analysis.originalText\n  });`;

// Le runtime a évolué plusieurs fois : l'ancien installateur cherchait un énorme
// bloc exact contenant memory.episodes.slice(-8). Le runtime actuel filtre les
// épisodes utiles puis utilise historyEpisodes.slice(-20), ce qui rendait cette
// ancre introuvable et faisait échouer tout le build Render.
//
// On cible désormais les frontières stables du bloc de construction : la lecture
// mémoire puis `let answer`. On vérifie quand même la présence de `messages` et du
// dernier message utilisateur afin de refuser une modification ambiguë.
const buildStarts = [
  '  const memory = exaucee.memory.getContext(ids);',
  '  const memory = exaucee.memory.getRelevantContext(ids, routed.text);',
];
let buildStart = -1;
for (const anchor of buildStarts) {
  const index = src.indexOf(anchor);
  if (index !== -1) {
    buildStart = index;
    break;
  }
}

const answerAnchor = '  let answer;';
const buildEnd = buildStart === -1 ? -1 : src.indexOf(answerAnchor, buildStart);
if (buildStart === -1 || buildEnd === -1) {
  throw new Error('[install-exaucee-cognition] bloc construction messages introuvable (ancres mémoire/réponse absentes)');
}

const existingBuild = src.slice(buildStart, buildEnd);
if (!existingBuild.includes('const messages = [') || !existingBuild.includes("{ role: 'user', content: routed.text }")) {
  throw new Error('[install-exaucee-cognition] bloc construction messages ambigu — arrêt de sécurité');
}

src = src.slice(0, buildStart) + newBuild + '\n\n' + src.slice(buildEnd);
src = src.replace(/exaucee\.ai\.complete\(\{\s*messages\s*\}\)/g, "exaucee.ai.complete({ messages, mode: analysis?.reasoningMode || 'normal' })");

const legacyCatch = `  } catch (error) {\n    answer = \`Je suis bien là 🌸 Mais mon moteur IA gratuit est momentanément indisponible. Réessaie dans un instant.\`;\n    exaucee.audit.write({ type: 'ai_error', code: error.code || null, message: error.message, chatId, userId });\n  }`;
const currentCatch = `  } catch (error) {\n    degraded = true;\n    answer = \`Je t’ai bien comprise, mais aucun de mes moteurs génératifs n’est disponible pour répondre correctement maintenant. Un owner peut vérifier *.exaucee providers*.\`;\n    exaucee.audit.write({ type: 'ai_error', code: error.code || null, message: error.message, chatId, userId });\n  }`;
const newCatch = `  } catch (error) {\n    degraded = true;\n    const local = exaucee.ai?.localBrain?.fallback?.(messages);\n    answer = sanitizeModelText(local?.text || \"Je suis là, mais aucun moteur génératif fiable n’est disponible pour cette réponse.\");\n    provider = local?.provider || 'exaucee-emergency-local';\n    exaucee.audit.write({ type: 'ai_error', code: error.code || null, message: error.message, chatId, userId });\n  }`;
if (src.includes(currentCatch)) src = src.replace(currentCatch, newCatch);
else if (src.includes(legacyCatch)) src = src.replace(legacyCatch, newCatch);

const legacyLearn = `  exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: provider });\n  exaucee.audit.write({ type: 'response', provider, chatId, userId });`;
const currentLearn = `  if (!degraded) {\n    exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: provider });\n  }\n  exaucee.audit.write({ type: 'response', provider, degraded, chatId, userId });`;
const newLegacyLearn = `  exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: provider });\n  exaucee.cognition.learn(exaucee.memory, ids, analysis, answer);\n  exaucee.audit.write({ type: 'response', provider, chatId, userId, intent: analysis.intent, tone: analysis.tone, reasoningMode: analysis.reasoningMode });`;
const newCurrentLearn = `  if (!degraded) {\n    exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: provider });\n    exaucee.cognition.learn(exaucee.memory, ids, analysis, answer);\n  }\n  exaucee.audit.write({ type: 'response', provider, degraded, chatId, userId, intent: analysis.intent, tone: analysis.tone, reasoningMode: analysis.reasoningMode });`;
if (src.includes(currentLearn)) src = src.replace(currentLearn, newCurrentLearn);
else if (src.includes(legacyLearn)) src = src.replace(legacyLearn, newLegacyLearn);

fs.writeFileSync(runtimePath, src);
checkRuntime('runtime patché invalide');

const finalSource = fs.readFileSync(runtimePath, 'utf8');
if (!finalSource.includes(MARKER)) throw new Error('[install-exaucee-cognition] marqueur cognition absent après patch');
if (!finalSource.includes('exaucee.memory.getRelevantContext(ids, routed.text)')) throw new Error('[install-exaucee-cognition] mémoire pertinente absente après patch');
if (!finalSource.includes("mode: analysis?.reasoningMode || 'normal'")) throw new Error('[install-exaucee-cognition] mode adaptatif absent après patch');

console.log('[install-exaucee-cognition] ✅ cognition installée avec ancrage runtime résilient + mémoire pertinente + mode adaptatif');
