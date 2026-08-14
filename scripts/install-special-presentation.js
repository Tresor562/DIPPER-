'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const menuPath = path.join(ROOT, 'commands', 'general_tools', 'menu.js');
const pingPath = path.join(ROOT, 'commands', 'general_tools', 'ping.js');
const reperePath = path.join(ROOT, 'commands', 'bot_sovereignty', 'repere.js');
const handlerPath = path.join(ROOT, 'handler.js');
const helperPath = path.join(ROOT, 'utils', 'specialPresentation.js');
const MARKER = '[SPECIAL PREMIUM PRESENTATION]';

for (const file of [menuPath, pingPath, reperePath, handlerPath, helperPath]) {
  if (!fs.existsSync(file)) throw new Error(`[special-presentation] fichier absent: ${file}`);
}

function replaceOnce(src, search, replacement, label, { optional = false } = {}) {
  const count = src.split(search).length - 1;
  if (count === 0) {
    if (src.includes(replacement) || optional) return src;
    throw new Error(`[special-presentation] ${label}: ancre absente`);
  }
  if (count !== 1) throw new Error(`[special-presentation] ${label}: ${count} occurrences`);
  return src.replace(search, replacement);
}

// Le menu source n'a pas toujours encore reçu le moteur interactif du wrapper.
// On exporte quand même l'image de style; si sendStyledMenuMessage existe,
// on active aussi le shell premium pour menu/allmenu.
let menu = fs.readFileSync(menuPath, 'utf8');
if (!menu.includes('module.exports.getImageBufferForStyle = getImageBufferForStyle;')) {
  menu += "\nmodule.exports.getImageBufferForStyle = getImageBufferForStyle; // [SPECIAL STYLE THUMBNAIL EXPORT]\n";
}
if (menu.includes('async function sendStyledMenuMessage(') && !menu.includes(MARKER)) {
  menu = replaceOnce(
    menu,
    "    imageBuffer: providedImageBuffer = null,\n  } = options;",
    "    imageBuffer: providedImageBuffer = null,\n    specialPresentation = false,\n    commandName = '',\n  } = options; // [SPECIAL PREMIUM PRESENTATION]",
    'options menu', { optional: true }
  );
  if (menu.includes('  const buildRelayNodes = () => {')) {
    menu = menu.replace(
      '  const buildRelayNodes = () => {',
      `  if (specialPresentation) {\n    const { sendSpecialPresentation } = require('../../utils/specialPresentation');\n    return sendSpecialPresentation(sock, jid, { text, style, imageBuffer, commandName: commandName || 'special' });\n  }\n\n  const buildRelayNodes = () => {`
    );
  }
}
fs.writeFileSync(menuPath, menu, 'utf8');

let ping = fs.readFileSync(pingPath, 'utf8');
if (!ping.includes('[PING SPECIAL PREMIUM PRESENTATION]') && ping.includes("typeof menu.sendStyledMenuMessage === 'function'")) {
  ping = replaceOnce(
    ping,
    "          quoted: from?.endsWith('@g.us') ? msg : null,\n          mentions: [],\n          withImage: false,",
    "          quoted: from?.endsWith('@g.us') ? msg : null,\n          mentions: [],\n          withImage: true,\n          specialPresentation: true, // [PING SPECIAL PREMIUM PRESENTATION]\n          commandName: 'ping',",
    'ping premium', { optional: true }
  );
  fs.writeFileSync(pingPath, ping, 'utf8');
}

let repere = fs.readFileSync(reperePath, 'utf8');
if (!repere.includes('[REPERE SPECIAL PREMIUM PRESENTATION]')) {
  const configImport = "const config = require('../../config');";
  if (repere.includes(configImport)) {
    repere = repere.replace(
      configImport,
      configImport + "\nconst styleManager = require('../../utils/styleManager');\nconst { sendSpecialPresentation } = require('../../utils/specialPresentation'); // [REPERE SPECIAL PREMIUM PRESENTATION]"
    );
  }
  const callNeedle = '      await sendInteractiveRepere(sock, from, caption, imageBuffer, quoted);';
  if (repere.includes(callNeedle)) {
    repere = repere.replace(callNeedle, `      const activeStyle = styleManager.getStyle();\n      let styleImage = null;\n      try {\n        const menu = require('../general_tools/menu');\n        if (typeof menu.getImageBufferForStyle === 'function') styleImage = await menu.getImageBufferForStyle(activeStyle);\n      } catch (_) {}\n      await sendSpecialPresentation(sock, from, {\n        text: caption, style: activeStyle, imageBuffer: styleImage || imageBuffer || null, commandName: 'repere',\n      });`);
  }
  fs.writeFileSync(reperePath, repere, 'utf8');
}

// Ce bloc ne peut être installé qu'après install-response-style/global-footer,
// car il utilise commandResponseStorage et decoratePayload.
let handler = fs.readFileSync(handlerPath, 'utf8');
if (!handler.includes('[GENERIC SPECIAL COMMAND PRESENTATION]') && handler.includes('const disciplinedPayload = decoratePayload(payload);')) {
  const anchor = '    const disciplinedPayload = decoratePayload(payload);';
  const replacement = `    const disciplinedPayload = decoratePayload(payload);\n\n    // [GENERIC SPECIAL COMMAND PRESENTATION]\n    const specialTrace = commandResponseStorage.getStore();\n    if (specialTrace && typeof disciplinedPayload?.text === 'string' &&\n        !disciplinedPayload.image && !disciplinedPayload.video && !disciplinedPayload.audio &&\n        !disciplinedPayload.document && !disciplinedPayload.sticker) {\n      try {\n        const { isSpecialCommand, sendSpecialPresentation } = require('./utils/specialPresentation');\n        if (isSpecialCommand(specialTrace.command)) {\n          const activeStyle = styleManager.getStyle();\n          let styleImage = null;\n          try {\n            const menuModule = require('./commands/general_tools/menu');\n            if (typeof menuModule.getImageBufferForStyle === 'function') styleImage = await menuModule.getImageBufferForStyle(activeStyle);\n          } catch (_) {}\n          return await sendSpecialPresentation(sock, jid, {\n            text: disciplinedPayload.text, style: activeStyle, imageBuffer: styleImage, commandName: specialTrace.command,\n          });\n        }\n      } catch (specialErr) {\n        console.warn('[special-presentation] fallback standard ' + (specialTrace?.command || '?') + ': ' + specialErr.message);\n      }\n    }`;
  handler = handler.replace(anchor, replacement);
  fs.writeFileSync(handlerPath, handler, 'utf8');
}

for (const file of [helperPath, menuPath, pingPath, reperePath, handlerPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[special-presentation] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
}

console.log('[special-presentation] ✅ helper + commandes spéciales prêts');
