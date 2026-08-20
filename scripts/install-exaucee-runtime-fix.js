'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const runtimePath = path.join(ROOT, 'ai_chat', 'runtime.js');
const responseStylePath = path.join(ROOT, 'utils', 'responseStyle.js');
const RUNTIME_MARKER = '[EXAUCEE SIGNATURE PAYLOAD]';
const STYLE_MARKER = '[EXAUCEE FOOTER BYPASS]';

for (const file of [runtimePath, responseStylePath]) {
  if (!fs.existsSync(file)) throw new Error(`[exaucee-runtime-fix] fichier absent: ${file}`);
}

let runtime = fs.readFileSync(runtimePath, 'utf8');
if (!runtime.includes(RUNTIME_MARKER)) {
  const oldLine = `  const payload = { text: sanitizeModelText(text) };`;
  const newLine = `  const cleanText = sanitizeModelText(text).trim();\n  const signedText = /(?:^|\\n)>\\s*Exaucée\\s*$/iu.test(cleanText)\n    ? cleanText\n    : cleanText + '\\n\\n> Exaucée';\n  const payload = { text: signedText, __exaucee: true }; // ${RUNTIME_MARKER}`;
  if (!runtime.includes(oldLine)) {
    throw new Error('[exaucee-runtime-fix] ancre sendExaucee introuvable');
  }
  runtime = runtime.replace(oldLine, newLine);
  fs.writeFileSync(runtimePath, runtime, 'utf8');
}

let style = fs.readFileSync(responseStylePath, 'utf8');
if (!style.includes(STYLE_MARKER)) {
  const compactAnchor = `function decoratePayload(payload,style){if(!payload||typeof payload!=='object'||payload.react||payload.delete)return payload;`;
  const compactReplacement = `function decoratePayload(payload,style){if(!payload||typeof payload!=='object'||payload.react||payload.delete)return payload;/* ${STYLE_MARKER} */if(payload.__exaucee===true){const exauceePayload={...payload};delete exauceePayload.__exaucee;return exauceePayload;}`;
  const legacyAnchor = `function decoratePayload(payload, style) {\n  if (!payload || typeof payload !== 'object') return payload;`;
  const legacyReplacement = `function decoratePayload(payload, style) {\n  if (!payload || typeof payload !== 'object') return payload;\n\n  // ${STYLE_MARKER}\n  // Les réponses d'Exaucée ont leur propre signature et ne doivent pas recevoir\n  // le footer global THE BIG DIPPER. Le marqueur interne est retiré avant Baileys.\n  if (payload.__exaucee === true) {\n    const exauceePayload = { ...payload };\n    delete exauceePayload.__exaucee;\n    return exauceePayload;\n  }`;

  if (style.includes(compactAnchor)) {
    style = style.replace(compactAnchor, compactReplacement);
  } else if (style.includes(legacyAnchor)) {
    style = style.replace(legacyAnchor, legacyReplacement);
  } else {
    throw new Error('[exaucee-runtime-fix] ancre decoratePayload introuvable');
  }
  fs.writeFileSync(responseStylePath, style, 'utf8');
}

for (const file of [runtimePath, responseStylePath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[exaucee-runtime-fix] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
  }
}

console.log('[exaucee-runtime-fix] ✅ moteur/footer Exaucée isolés; signature: > Exaucée');
