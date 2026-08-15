'use strict';

const fs = require('fs');
const path = require('path');

for (const file of ['handler.js', 'index.js']) {
  const target = path.join(process.cwd(), file);
  if (!fs.existsSync(target)) continue;
  const before = fs.readFileSync(target, 'utf8');
  const after = before.replace(/require\('\.\/ai_chat\/runtime'\)/g, "require('./ai_chat/runtimeControl')");
  if (after !== before) {
    fs.writeFileSync(target, after);
    console.log(`[install-exaucee-controls] ${file} raccordé à runtimeControl`);
  }
}
