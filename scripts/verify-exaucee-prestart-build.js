'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const installers = [
  'scripts/install-exaucee.js','scripts/install-global-footer.js','scripts/install-exaucee-runtime-fix.js','scripts/install-exaucee-controls.js','scripts/install-exaucee-cognition.js','scripts/install-exaucee-multigame.js','scripts/install-exaucee-command-builder.js','scripts/install-exaucee-social-context.js','scripts/install-exaucee-research.js',
];
function runNode(relativePath,args=[]){const result=spawnSync(process.execPath,[relativePath,...args],{cwd:ROOT,encoding:'utf8',env:{...process.env,EXAUCEE_BUILD_PREFLIGHT:'1'},timeout:60_000});if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.error)throw new Error(`[exaucee-build-preflight] ${relativePath}: ${result.error.message}`);if(result.status!==0)throw new Error(`[exaucee-build-preflight] ${relativePath} a échoué (code ${result.status}).`);}
function verifyExauceePrestartBuild(){
  console.log('[exaucee-build-preflight] vérification de la chaîne Exaucée avant runtime...');
  for(const installer of installers)runNode(installer);
  for(const file of ['handler.js','index.js','api/server.js','ai_chat/runtime.js','ai_chat/core/index.js','ai_chat/ai/zeroCostRouter.js','ai_chat/ai/responseQuality.js','ai_chat/memory/store.js','ai_chat/cognition/cognitivePolicy.js','ai_chat/cognition/cognitiveEngine.js','ai_chat/knowledge/creatorProfile.js','ai_chat/cognition/intentOrchestrator.js','ai_chat/games/tournamentDirector.js','ai_chat/games/gameDesigner.js','ai_chat/games/gameContentGenerator.js','ai_chat/games/megaGameRuntime.js','scripts/install-exaucee-mega-gamemaster.js'])runNode('--check',[file]);
  runNode('--test',['tests/exaucee-conversation-quality.test.js']);
  runNode('--test',['tests/exaucee-cognitive-v2.test.js']);
  runNode('--test',['tests/exaucee-mega-gamemaster.test.js']);
  for(const installer of installers)runNode(installer);
  for(const file of ['ai_chat/runtime.js','ai_chat/core/index.js','ai_chat/ai/zeroCostRouter.js','ai_chat/ai/responseQuality.js','ai_chat/memory/store.js','ai_chat/cognition/cognitivePolicy.js','ai_chat/games/tournamentDirector.js','ai_chat/games/megaGameRuntime.js','handler.js','index.js'])runNode('--check',[file]);
  console.log('[exaucee-build-preflight] ✅ chaîne Exaucée valide + idempotente + cognitive v2 + Mega GameMaster V3 avant démarrage');
}
if(require.main===module){try{verifyExauceePrestartBuild();}catch(error){console.error(error.stack||error.message||error);process.exit(1);}}
module.exports=verifyExauceePrestartBuild;
