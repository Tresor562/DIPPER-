'use strict';

const fs = require('fs');
const path = require('path');

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
let rawOccurrences = 0;
for (const file of files) {
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
const runtimeGuardInstalled = handler.includes('[RESPONSE STYLE DISCIPLINE]') &&
  handler.includes('const disciplinedPayload = decoratePayload(payload);') &&
  handler.includes('await _orig(jid, disciplinedPayload, opts)');

const report = {
  generatedAt: new Date().toISOString(),
  commandFiles: files.length,
  filesWithLegacyDecoration: details.length,
  rawOccurrences,
  runtimeGuardInstalled,
  details,
  note: 'Les occurrences brutes sont un inventaire de dette visuelle. Le garde-fou central nettoie les text/caption à l’envoi sans modifier la logique métier.',
};

fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(`[visual-audit] commandes=${report.commandFiles} fichiers_legacy=${report.filesWithLegacyDecoration} occurrences=${rawOccurrences} garde_fou=${runtimeGuardInstalled ? 'OK' : 'ABSENT'}`);
if (!runtimeGuardInstalled) process.exitCode = 1;
