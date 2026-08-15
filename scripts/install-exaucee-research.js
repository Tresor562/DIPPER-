'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const runtimePath = path.join(ROOT, 'ai_chat', 'runtime.js');
const MARKER = '[EXAUCEE RESEARCH V1]';

function installBotKnowledge() {
  require('./install-exaucee-bot-knowledge.js');
}

let src = fs.readFileSync(runtimePath, 'utf8');
if (src.includes(MARKER)) {
  console.log('[install-exaucee-research] déjà appliqué');
  installBotKnowledge();
  process.exit(0);
}

const answerAnchor = `  let answer;\n  let provider = 'fallback';`;
if (!src.includes(answerAnchor)) throw new Error('[install-exaucee-research] ancre answer introuvable');

const researchBlock = `  // ${MARKER}\n  let researchReport = null;\n  if (exaucee.research?.needsResearch?.(routed.text)) {\n    try {\n      researchReport = await exaucee.research.research(routed.text, {\n        lang: analysis?.language || 'fr',\n        deep: true\n      });\n      const researchContext = exaucee.research.buildContext(researchReport);\n      if (researchContext) {\n        messages.splice(Math.max(1, messages.length - 1), 0, {\n          role: 'system',\n          content: [\n            'Résultats de recherche Web récents ci-dessous.',\n            'Réponds en t’appuyant sur ces sources. Distingue les faits établis des incertitudes et ne fabrique jamais un fait absent des sources.',\n            'Si les sources se contredisent, signale-le clairement. Pour une information datée, privilégie les éléments les plus récents et explicites.',\n            researchContext\n          ].join('\\n\\n')\n        });\n      }\n      exaucee.audit.write({\n        type: 'research', chatId, userId, query: routed.text.slice(0, 300),\n        sources: researchReport?.results?.length || 0, directUrl: Boolean(researchReport?.directUrl)\n      });\n    } catch (error) {\n      exaucee.audit.write({ type: 'research_error', chatId, userId, message: error.message });\n    }\n  }\n\n  let answer;\n  let provider = 'fallback';`;
src = src.replace(answerAnchor, researchBlock);

const postTryAnchor = `  if (!answer) return false;\n  await sendExaucee(sock, exaucee, chatId, msg, answer.slice(0, 12000));`;
if (!src.includes(postTryAnchor)) throw new Error('[install-exaucee-research] ancre send answer introuvable');

const postTry = `  if (researchReport?.results?.length) {\n    if (!answer || /^exaucee-local|^fallback|^exaucee-emergency-local/i.test(String(provider))) {\n      answer = exaucee.research.fallbackSummary(researchReport);\n      provider = 'exaucee-research-local-summary';\n    }\n    const sourceFooter = exaucee.research.sourceFooter(researchReport);\n    if (sourceFooter) answer = \`${'${String(answer || "").trim()}'}\\n\\n${'${sourceFooter}'}\`;\n  }\n  if (!answer) return false;\n  await sendExaucee(sock, exaucee, chatId, msg, answer.slice(0, 12000));`;
src = src.replace(postTryAnchor, postTry);

fs.writeFileSync(runtimePath, src, 'utf8');
const check = spawnSync(process.execPath, ['--check', runtimePath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`[install-exaucee-research] runtime invalide: ${check.stderr || check.stdout}`);
console.log('[install-exaucee-research] ✅ recherche multi-source + lecture URL + citations installées');
installBotKnowledge();
