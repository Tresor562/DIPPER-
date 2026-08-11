'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMMANDS_DIR = path.join(ROOT, 'commands');
const REPORT_PATH = path.join(ROOT, 'silent-response-audit.json');

function listJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function count(source, regex) {
  return (source.match(regex) || []).length;
}

function inspect(file) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const directSend = count(source, /\b(?:sock|client|conn|bot)\.sendMessage\s*\(/g);
  const quoted = count(source, /quoted\s*:\s*msg\b/g);
  const emptyCatch = count(source, /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g);
  const swallowedPromise = count(source, /\.catch\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*(?:\{\s*\}|null|undefined|false)\s*\)/g);

  const unawaitedLines = [];
  lines.forEach((line, index) => {
    if (!/\.sendMessage\s*\(/.test(line)) return;
    const before = line.split('.sendMessage')[0];
    if (!/\bawait\b|\breturn\b/.test(before)) {
      unawaitedLines.push(index + 1);
    }
  });

  const risks = [];
  if (directSend && quoted) risks.push('quoted-direct-send');
  if (directSend && (emptyCatch || swallowedPromise)) risks.push('send-error-can-be-swallowed');
  if (unawaitedLines.length) risks.push('send-not-awaited');

  return {
    file: path.relative(ROOT, file).replace(/\\/g, '/'),
    directSend,
    quoted,
    emptyCatch,
    swallowedPromise,
    unawaitedLines,
    risks,
  };
}

const rows = listJs(COMMANDS_DIR).map(inspect);
const risky = rows.filter(row => row.risks.length);
const high = risky.filter(row => row.risks.includes('send-error-can-be-swallowed'));

const report = {
  generatedAt: new Date().toISOString(),
  inspectedFiles: rows.length,
  riskyFiles: risky.length,
  highRiskFiles: high.length,
  rows: risky,
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

console.log(`[silent-audit] ${rows.length} fichiers inspectés`);
console.log(`[silent-audit] ${risky.length} fichier(s) avec ancien pattern d'envoi; ${high.length} à risque élevé`);
for (const row of risky) {
  console.log(`[silent-audit] ${row.file} | ${row.risks.join(', ')}${row.unawaitedLines.length ? ` | lignes:${row.unawaitedLines.join(',')}` : ''}`);
}
console.log('[silent-audit] ✅ rapport écrit dans silent-response-audit.json (audit non bloquant)');
process.exit(0);
