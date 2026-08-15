'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const runtimePath = path.join(ROOT, 'ai_chat', 'runtime.js');
const cognitionPath = path.join(ROOT, 'ai_chat', 'cognition', 'cognitiveEngine.js');
const MARKER = '[EXAUCEE SOCIAL CONTEXT V1]';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`[exaucee-social] ancre introuvable: ${label}`);
  return source.replace(from, to);
}

let cognition = fs.readFileSync(cognitionPath, 'utf8');
if (!cognition.includes("require('./socialContext')")) {
  cognition = cognition.replace("'use strict';", "'use strict';\n\nconst { socialInstruction } = require('./socialContext');");
}
if (!cognition.includes(MARKER)) {
  const anchor = "      'Dans un groupe, ne monopolise pas la conversation. Réponds à la personne qui t’a réellement sollicitée et respecte les échanges humains.',";
  const replacement = `${anchor}\n      socialInstruction(context.social || {}, context.groupHistory || []), // ${MARKER}`;
  cognition = replaceOnce(cognition, anchor, replacement, 'social instruction');
}
fs.writeFileSync(cognitionPath, cognition, 'utf8');

let runtime = fs.readFileSync(runtimePath, 'utf8');
if (!runtime.includes("require('./cognition/socialContext')")) {
  const importAnchor = "const { createExaucee } = require('./core');";
  runtime = replaceOnce(runtime, importAnchor, `${importAnchor}\nconst { extractSocialContext, formatGroupHistory } = require('./cognition/socialContext');`, 'runtime import');
}

if (!runtime.includes(MARKER)) {
  const contextAnchor = "  const cognitiveContext = { isGroup: chatId.endsWith('@g.us'), userId, actor, botIsAdmin };";
  const contextReplacement = `  const isGroupConversation = chatId.endsWith('@g.us');\n  const sharedSocialIds = { sessionId, chatId, userId: '__group_social__' };\n  const sharedSocialMemory = isGroupConversation ? exaucee.memory.getContext(sharedSocialIds) : { episodes: [] };\n  const social = extractSocialContext(msg, { botJids: knownBotJids });\n  const cognitiveContext = {\n    isGroup: isGroupConversation, userId, actor, botIsAdmin,\n    social,\n    groupHistory: formatGroupHistory(sharedSocialMemory, 20)\n  }; // ${MARKER}`;
  runtime = replaceOnce(runtime, contextAnchor, contextReplacement, 'cognitive context');

  const learnAnchor = "  exaucee.cognition.learn(exaucee.memory, ids, analysis, answer);";
  const learnReplacement = `  if (isGroupConversation) {\n    const speakerLabel = social.speakerName || String(userId).split('@')[0] || 'membre';\n    if (!SENSITIVE_TEXT_RE.test(routed.text)) {\n      exaucee.memory.remember(sharedSocialIds, {\n        type: 'episode',\n        value: \`human(\${speakerLabel}|\${userId}): \${routed.text}\`,\n        source: 'group-social-context'\n      });\n    }\n    exaucee.memory.remember(sharedSocialIds, {\n      type: 'episode',\n      value: \`assistant(Exaucée): \${answer}\`,\n      source: provider\n    });\n  }\n  exaucee.cognition.learn(exaucee.memory, ids, analysis, answer);`;
  runtime = replaceOnce(runtime, learnAnchor, learnReplacement, 'group social learning');
}
fs.writeFileSync(runtimePath, runtime, 'utf8');

for (const file of [runtimePath, cognitionPath]) {
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(`[exaucee-social] syntaxe invalide ${path.relative(ROOT, file)}: ${checked.stderr || checked.stdout}`);
}

console.log('[exaucee-social] ✅ citations, mentions, auteurs et mémoire sociale de groupe installés');
