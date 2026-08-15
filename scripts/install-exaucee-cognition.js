'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const runtimePath = path.join(root, 'ai_chat', 'runtime.js');
const MARKER = '[EXAUCEE COGNITIVE PIPELINE]';

let src = fs.readFileSync(runtimePath, 'utf8');
if (src.includes(MARKER)) {
  console.log('[install-exaucee-cognition] déjà appliqué');
  process.exit(0);
}

const oldBuild = `  const memory = exaucee.memory.getContext(ids);\n  const messages = [\n    { role: 'system', content: systemPrompt(exaucee, memory, { isGroup: chatId.endsWith('@g.us'), userId }) },\n    ...((memory.episodes || []).slice(-8).flatMap(ep => {\n      const value = String(ep.value || '');\n      const sep = value.indexOf(': ');\n      if (sep < 0) return [];\n      const role = value.slice(0, sep) === 'assistant' ? 'assistant' : 'user';\n      return [{ role, content: value.slice(sep + 2) }];\n    })),\n    { role: 'user', content: routed.text }\n  ];`;

const newBuild = `  // ${MARKER}\n  const memory = exaucee.memory.getContext(ids);\n  const cognitiveContext = { isGroup: chatId.endsWith('@g.us'), userId, actor, botIsAdmin };\n  const analysis = exaucee.cognition.analyze(routed.text, memory, cognitiveContext);\n  const messages = exaucee.cognition.buildMessages({\n    persona: exaucee.persona,\n    memory,\n    analysis,\n    context: cognitiveContext\n  });\n  exaucee.audit.write({\n    type: 'cognition', chatId, userId,\n    intent: analysis.intent, tone: analysis.tone, language: analysis.language,\n    implicitReference: analysis.resolvedText !== analysis.originalText\n  });`;

if (!src.includes(oldBuild)) throw new Error('[install-exaucee-cognition] bloc construction messages introuvable');
src = src.replace(oldBuild, newBuild);

const oldCatch = `  } catch (error) {\n    answer = \`Je suis bien là 🌸 Mais mon moteur IA gratuit est momentanément indisponible. Réessaie dans un instant.\`;\n    exaucee.audit.write({ type: 'ai_error', code: error.code || null, message: error.message, chatId, userId });\n  }`;
const newCatch = `  } catch (error) {\n    // Le routeur est censé toujours fournir le cerveau local en dernier recours.\n    // Cette branche protège néanmoins contre une erreur interne imprévue.\n    const local = exaucee.ai?.localBrain?.fallback?.(messages);\n    answer = sanitizeModelText(local?.text || \"Je suis là. J’ai perdu le fil une seconde — redis-moi juste la dernière chose et je reprends.\");\n    provider = local?.provider || 'exaucee-emergency-local';\n    exaucee.audit.write({ type: 'ai_error', code: error.code || null, message: error.message, chatId, userId });\n  }`;
if (!src.includes(oldCatch)) throw new Error('[install-exaucee-cognition] bloc fallback IA introuvable');
src = src.replace(oldCatch, newCatch);

const oldLearn = `  exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: provider });\n  exaucee.audit.write({ type: 'response', provider, chatId, userId });`;
const newLearn = `  exaucee.memory.remember(ids, { type: 'episode', value: \`assistant: \${answer}\`, source: provider });\n  exaucee.cognition.learn(exaucee.memory, ids, analysis, answer);\n  exaucee.audit.write({ type: 'response', provider, chatId, userId, intent: analysis.intent, tone: analysis.tone });`;
if (!src.includes(oldLearn)) throw new Error('[install-exaucee-cognition] bloc apprentissage introuvable');
src = src.replace(oldLearn, newLearn);

fs.writeFileSync(runtimePath, src);
const check = spawnSync(process.execPath, ['--check', runtimePath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(check.stderr || check.stdout || 'runtime invalide');
console.log('[install-exaucee-cognition] ✅ cognition, mémoire longue et fallback local appliqués');
