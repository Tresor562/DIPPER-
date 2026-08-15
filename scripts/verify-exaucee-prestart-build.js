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

function runNode(relativePath, args = []) {
  const result = spawnSync(process.execPath, [relativePath, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, EXAUCEE_BUILD_PREFLIGHT: '1' },
    timeout: 60_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    throw new Error(`[exaucee-build-preflight] ${relativePath}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[exaucee-build-preflight] ${relativePath} a échoué (code ${result.status}).`);
  }
}

function verifyExauceePrestartBuild() {
  console.log('[exaucee-build-preflight] vérification de la chaîne Exaucée avant runtime...');

  for (const installer of installers) runNode(installer);

  for (const file of [
    'handler.js',
    'index.js',
    'api/server.js',
    'ai_chat/runtime.js',
    'ai_chat/ai/zeroCostRouter.js',
    'ai_chat/ai/responseQuality.js',
    'ai_chat/knowledge/creatorProfile.js',
    'ai_chat/cognition/intentOrchestrator.js',
  ]) {
    runNode('--check', [file]);
  }

  runNode('--test', ['tests/exaucee-conversation-quality.test.js']);

  // Deuxième passage : les installateurs doivent être idempotents. C'est crucial
  // car Render les exécute une fois au build puis npm start relance prestart.
  for (const installer of installers) runNode(installer);

  runNode('--check', ['ai_chat/runtime.js']);
  runNode('--check', ['ai_chat/ai/zeroCostRouter.js']);
  runNode('--check', ['ai_chat/ai/responseQuality.js']);
  runNode('--check', ['handler.js']);
  runNode('--check', ['index.js']);

  console.log('[exaucee-build-preflight] ✅ chaîne Exaucée valide + idempotente avant démarrage');
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