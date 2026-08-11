'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const COMMANDS = path.join(ROOT, 'commands');
const REPORT = path.join(ROOT, 'response-style-audit.json');
const FORBIDDEN = /[╭╮╰╯┃║╔╗╚╝╠╣╦╩╬┌┐└┘│≪≫╼╾]/u;
const HEAVY = /[╭╮╰╯┃║╔╗╚╝╠╣╦╩╬┌┐└┘│≪≫╼╾]/gu;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(COMMANDS);
const details = [];
const syntaxFailures = [];
let rawOccurrences = 0;

for (const file of files) {
  // Vérification 1 par fichier : la commande doit rester syntaxiquement valide.
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    syntaxFailures.push({ file: path.relative(ROOT, file), error: (syntax.stderr || syntax.stdout || '').trim() });
  }

  // Vérification 2 par fichier : inventaire exact des décorations legacy.
  const src = fs.readFileSync(file, 'utf8');
  const matches = src.match(HEAVY) || [];
  if (!matches.length) continue;
  rawOccurrences += matches.length;
  const lines = src.split(/\r?\n/);
  const affectedLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (FORBIDDEN.test(lines[i])) affectedLines.push(i + 1);
  }
  details.push({
    file: path.relative(ROOT, file),
    occurrences: matches.length,
    lines: affectedLines,
  });
}

const handler = fs.readFileSync(path.join(ROOT, 'handler.js'), 'utf8');

// Vérification 3 globale : toutes les commandes passent par le même socket
// enveloppé, et buildExtra leur fournit les phrases du moteur discipliné.
const runtimeGuardInstalled = handler.includes('[RESPONSE STYLE DISCIPLINE]') &&
  handler.includes('const disciplinedPayload = decoratePayload(payload);') &&
  handler.includes('await _orig(jid, disciplinedPayload, opts)');
const disciplinedPhrasesInstalled = handler.includes('[RESPONSE STYLE PHRASES]') &&
  handler.includes("getLegacyPhrases()") &&
  handler.includes("renderResponse: require('./utils/responseStyle').renderResponse");

const report = {
  generatedAt: new Date().toISOString(),
  commandFiles: files.length,
  syntaxFailures,
  filesWithLegacyDecoration: details.length,
  rawOccurrences,
  runtimeGuardInstalled,
  disciplinedPhrasesInstalled,
  details,
  note: 'Les occurrences brutes sont un inventaire de dette visuelle dans le source. Les text/caption réellement envoyés passent par le garde-fou central et extra.phrases passe par la palette active, sans modifier la logique métier.',
};

fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(
  `[visual-audit] commandes=${report.commandFiles}` +
  ` syntaxe_ko=${syntaxFailures.length}` +
  ` fichiers_legacy=${report.filesWithLegacyDecoration}` +
  ` occurrences=${rawOccurrences}` +
  ` garde_fou=${runtimeGuardInstalled ? 'OK' : 'ABSENT'}` +
  ` phrases=${disciplinedPhrasesInstalled ? 'OK' : 'ABSENT'}`
);

if (syntaxFailures.length || !runtimeGuardInstalled || !disciplinedPhrasesInstalled) process.exitCode = 1;
