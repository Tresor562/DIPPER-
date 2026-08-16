'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const runtimePath = path.join(ROOT, 'ai_chat', 'runtime.js');
const cognitionPath = path.join(ROOT, 'ai_chat', 'cognition', 'cognitiveEngine.js');
const MARKER = '[EXAUCEE SOCIAL CONTEXT V1]';
const THREAD_MARKER = '[EXAUCEE CONVERSATION THREADS V1]';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`[exaucee-social] ancre introuvable: ${label}`);
  return source.replace(from, to);
}

function installSocialInstruction(source) {
  if (source.includes(MARKER)) return source;

  // Ancienne formulation du prompt.
  const legacyAnchor = "      'Dans un groupe, ne monopolise pas la conversation. Réponds à la personne qui t’a réellement sollicitée et respecte les échanges humains.',";
  if (source.includes(legacyAnchor)) {
    return source.replace(
      legacyAnchor,
      `${legacyAnchor}\n      socialInstruction(context.social || {}, context.groupHistory || []), // ${MARKER}`
    );
  }

  // Le moteur cognitif actuel a fusionné la consigne de groupe dans une phrase
  // plus large. On s'ancre donc sur l'étape métacognitive, beaucoup plus stable,
  // et on insère la consigne sociale juste avant elle.
  const metaAnchor = "metacognitionInstruction(analysis.reasoningMode||'normal')";
  if (source.includes(metaAnchor)) {
    return source.replace(
      metaAnchor,
      `socialInstruction(context.social || {}, context.groupHistory || []), /* ${MARKER} */ ${metaAnchor}`
    );
  }

  throw new Error('[exaucee-social] ancre introuvable: social instruction');
}

let cognition = fs.readFileSync(cognitionPath, 'utf8');
if (!cognition.includes("require('./socialContext')")) {
  cognition = cognition.replace("'use strict';", "'use strict';\n\nconst { socialInstruction } = require('./socialContext');");
}
cognition = installSocialInstruction(cognition);
fs.writeFileSync(cognitionPath, cognition, 'utf8');

let runtime = fs.readFileSync(runtimePath, 'utf8');
if (!runtime.includes("require('./cognition/socialContext')")) {
  const importAnchor = "const { createExaucee } = require('./core');";
  runtime = replaceOnce(runtime, importAnchor, `${importAnchor}\nconst { extractSocialContext, formatGroupHistory } = require('./cognition/socialContext');`, 'runtime social import');
}
if (!runtime.includes("require('./cognition/conversationThreads')")) {
  const socialImport = "const { extractSocialContext, formatGroupHistory } = require('./cognition/socialContext');";
  runtime = replaceOnce(runtime, socialImport, `${socialImport}\nconst { ConversationThreads, looksLikeFollowup } = require('./cognition/conversationThreads');\nconst exauceeConversationThreads = new ConversationThreads(); // ${THREAD_MARKER}`, 'thread import');
}

if (!runtime.includes(MARKER)) {
  const contextAnchor = "  const cognitiveContext = { isGroup: chatId.endsWith('@g.us'), userId, actor, botIsAdmin };";
  const contextReplacement = `  const isGroupConversation = chatId.endsWith('@g.us');\n  const sharedSocialIds = { sessionId, chatId, userId: '__group_social__' };\n  const sharedSocialMemory = isGroupConversation ? exaucee.memory.getContext(sharedSocialIds) : { episodes: [] };\n  const social = extractSocialContext(msg, { botJids: knownBotJids });\n  const cognitiveContext = {\n    isGroup: isGroupConversation, userId, actor, botIsAdmin,\n    social,\n    groupHistory: formatGroupHistory(sharedSocialMemory, 20)\n  }; // ${MARKER}`;
  runtime = replaceOnce(runtime, contextAnchor, contextReplacement, 'cognitive context');

  const learnAnchor = "  exaucee.cognition.learn(exaucee.memory, ids, analysis, answer);";
  const learnReplacement = `  if (isGroupConversation) {\n    const speakerLabel = social.speakerName || String(userId).split('@')[0] || 'membre';\n    if (!SENSITIVE_TEXT_RE.test(routed.text)) {\n      exaucee.memory.remember(sharedSocialIds, {\n        type: 'episode',\n        value: \`human(\${speakerLabel}|\${userId}): \${routed.text}\`,\n        source: 'group-social-context'\n      });\n    }\n    exaucee.memory.remember(sharedSocialIds, {\n      type: 'episode',\n      value: \`assistant(Exaucée): \${answer}\`,\n      source: provider\n    });\n  }\n  exaucee.cognition.learn(exaucee.memory, ids, analysis, answer);`;
  runtime = replaceOnce(runtime, learnAnchor, learnReplacement, 'group social learning');
}

if (!runtime.includes('active-conversation-thread')) {
  const routeBlock = `  const knownBotJids = botJids(sock);\n  const routed = exaucee.inspectMessage({\n    msg,\n    botJid: knownBotJids[0],\n    botJids: knownBotJids,\n    humanTakeover: hasHumanTakeover(sessionId, chatId)\n  });\n\n  if (!routed.shouldRespond || !routed.text.trim()) return false;\n\n  const userId = actorJid(msg);`;
  const routeReplacement = `  const knownBotJids = botJids(sock);\n  const userId = actorJid(msg);\n  let routed = exaucee.inspectMessage({\n    msg,\n    botJid: knownBotJids[0],\n    botJids: knownBotJids,\n    humanTakeover: hasHumanTakeover(sessionId, chatId)\n  });\n\n  // ${THREAD_MARKER}\n  // Après une sollicitation réelle, seul le même membre peut poursuivre brièvement\n  // sans répéter « Exaucée », et uniquement si son message ressemble à une suite.\n  if (!routed.shouldRespond && chatId.endsWith('@g.us') &&\n      exauceeConversationThreads.active(sessionId, chatId, userId) &&\n      looksLikeFollowup(routed.text)) {\n    routed = { ...routed, shouldRespond: true, reason: 'active-conversation-thread' };\n  }\n\n  if (!routed.shouldRespond || !routed.text.trim()) return false;\n  if (chatId.endsWith('@g.us')) exauceeConversationThreads.touch(sessionId, chatId, userId);`;
  runtime = replaceOnce(runtime, routeBlock, routeReplacement, 'conversation continuation');
}

fs.writeFileSync(runtimePath, runtime, 'utf8');

for (const file of [runtimePath, cognitionPath]) {
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(`[exaucee-social] syntaxe invalide ${path.relative(ROOT, file)}: ${checked.stderr || checked.stdout}`);
}

console.log('[exaucee-social] ✅ citations, mentions, auteurs, mémoire sociale et continuité de discussion installés');
