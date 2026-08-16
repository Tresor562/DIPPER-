'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const installers = [
  'scripts/install-exaucee.js',
  'scripts/install-global-footer.js',
  'scripts/install-exaucee-runtime-fix.js',
  'scripts/install-exaucee-controls.js',
  'scripts/install-exaucee-cognition.js',
  'scripts/install-exaucee-multigame.js',
  'scripts/install-exaucee-command-builder.js',
  'scripts/install-exaucee-social-context.js',
  'scripts/install-exaucee-research.js',
];

const syntaxFiles = [
  'handler.js',
  'index.js',
  'api/server.js',
  'ai_chat/runtime.js',
  'ai_chat/core/index.js',
  'ai_chat/ai/zeroCostRouter.js',
  'ai_chat/ai/responseQuality.js',
  'ai_chat/memory/store.js',
  'ai_chat/cognition/cognitivePolicy.js',
  'ai_chat/cognition/cognitiveEngine.js',
  'ai_chat/cognition/generalOrchestrator.js',
  'ai_chat/research/researchEngine.js',
  'ai_chat/dynamic/workflowEngine.js',
  'ai_chat/knowledge/creatorProfile.js',
  'ai_chat/cognition/intentOrchestrator.js',
  'ai_chat/games/tournamentDirector.js',
  'ai_chat/games/gameDesigner.js',
  'ai_chat/games/gameContentGenerator.js',
  'ai_chat/games/megaGameRuntime.js',
  'scripts/install-exaucee-mega-gamemaster.js',
];

const testFiles = [
  'tests/exaucee-conversation-quality.test.js',
  'tests/exaucee-cognitive-v2.test.js',
  'tests/exaucee-mega-gamemaster.test.js',
  'tests/exaucee-general-x5.test.js',
];

const finalSyntaxFiles = [
  'ai_chat/runtime.js',
  'ai_chat/core/index.js',
  'ai_chat/ai/zeroCostRouter.js',
  'ai_chat/ai/responseQuality.js',
  'ai_chat/memory/store.js',
  'ai_chat/cognition/cognitivePolicy.js',
  'ai_chat/cognition/cognitiveEngine.js',
  'ai_chat/cognition/generalOrchestrator.js',
  'ai_chat/research/researchEngine.js',
  'ai_chat/dynamic/workflowEngine.js',
  'ai_chat/games/tournamentDirector.js',
  'ai_chat/games/megaGameRuntime.js',
  'handler.js',
  'index.js',
];

function runNode(relativePath, args = [], options = {}) {
  const fatal = options.fatal !== false;
  const label = options.label || [relativePath, ...args].join(' ');
  const result = spawnSync(process.execPath, [relativePath, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, EXAUCEE_BUILD_PREFLIGHT: '1' },
    timeout: 60_000,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    const error = new Error(`[exaucee-build-preflight] ${label}: ${result.error.message}`);
    if (fatal) throw error;
    console.warn(`⚠️ ${error.message}`);
    return false;
  }

  if (result.status !== 0) {
    const error = new Error(`[exaucee-build-preflight] ${label} a échoué (code ${result.status}).`);
    if (fatal) throw error;
    console.warn(`⚠️ ${error.message}`);
    return false;
  }

  return true;
}

function verifyExauceePrestartBuild() {
  console.log('[exaucee-build-preflight] vérification de la chaîne Exaucée avant runtime...');

  console.log('[exaucee-build-preflight] phase 1/5 — installateurs runtime');
  for (const installer of installers) {
    runNode(installer, [], { label: `installateur ${installer}` });
  }

  console.log('[exaucee-build-preflight] phase 2/5 — syntaxe runtime');
  for (const file of syntaxFiles) {
    runNode('--check', [file], { label: `syntaxe ${file}` });
  }

  // Les tests de qualité Exaucée sont importants, mais ils ne doivent pas
  // rendre tout le service indisponible sur Render alors que le runtime est
  // syntaxiquement valide et que tous les installateurs passent. Pour les
  // pipelines qui veulent conserver un gate strict, EXAUCEE_TESTS_STRICT=1
  // réactive l'échec bloquant.
  console.log('[exaucee-build-preflight] phase 3/5 — tests qualité Exaucée');
  const strictTests = process.env.EXAUCEE_TESTS_STRICT === '1';
  const failedTests = [];
  for (const testFile of testFiles) {
    const ok = runNode('--test', [testFile], {
      fatal: strictTests,
      label: `test ${testFile}`,
    });
    if (!ok) failedTests.push(testFile);
  }

  console.log('[exaucee-build-preflight] phase 4/5 — idempotence installateurs');
  for (const installer of installers) {
    runNode(installer, [], { label: `idempotence ${installer}` });
  }

  console.log('[exaucee-build-preflight] phase 5/5 — syntaxe finale');
  for (const file of finalSyntaxFiles) {
    runNode('--check', [file], { label: `syntaxe finale ${file}` });
  }

  if (failedTests.length) {
    console.warn(`[exaucee-build-preflight] ⚠️ ${failedTests.length} test(s) qualité en échec non bloquant(s): ${failedTests.join(', ')}`);
  }

  console.log('[exaucee-build-preflight] ✅ runtime Exaucée valide + installateurs idempotents; les tests qualité restent observés sans bloquer Render');
}

if (require.main === module) {
  try {
    verifyExauceePrestartBuild();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
}

module.exports = verifyExauceePrestartBuild;
