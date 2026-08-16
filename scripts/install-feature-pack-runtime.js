'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const runtimePath = path.join(ROOT, 'utils', 'featurePackRuntime.js');
const GROUP_MARKER = '[FEATURE PACK 2026-08-16 RUNTIME]';
const PRESENCE_MARKER = '[FEATURE PACK AUTO PRESENCE]';

if (!fs.existsSync(handlerPath) || !fs.existsSync(runtimePath)) {
  throw new Error('[feature-pack] handler/runtime introuvable');
}

function replaceUniqueRegex(source, regex, replacer, label) {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))];
  if (matches.length !== 1) {
    throw new Error(`[feature-pack] ${label}: attendu 1 emplacement, trouvé ${matches.length}`);
  }
  return source.replace(regex, replacer);
}

let src = fs.readFileSync(handlerPath, 'utf8');

// @all : ancre structurelle autour du chargement des métadonnées de groupe.
// Cette ancre ne dépend pas des patches AntiLink/Exaucée exécutés avant nous.
if (!src.includes(GROUP_MARKER)) {
  const groupRegex = /(\s*if \(!_groupMetadataLoaded\) \{ groupMetadata = await getGroupMeta\(\); \}\r?\n\s*if \(!_botIsAdminLoaded\)\s*\{ botIsAdmin\s*= await getBotAdmin\(\); \}\r?\n)(\s*\/\/ ANTI-ALL)/;
  src = replaceUniqueRegex(src, groupRegex, (full, metaBlock, antiAllLine) => {
    return `${metaBlock}\n      // ${GROUP_MARKER}\n      // @all est un raccourci de groupe, pas une commande préfixée : le traiter\n      // ici avant les protections et avant tout retour de message non-commande.\n      if (/^@(all|everyone)(?:\\s|$)/i.test(String(body || '').trim())) {\n        const _featurePackSenderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);\n        if (await require('./utils/featurePackRuntime').handleAdminAtAll({\n          sock, msg, from, sender, body, groupMetadata,\n          isAdmin: _featurePackSenderIsAdmin, isOwner: isMe,\n        })) return;\n      }\n\n${antiAllLine}`;
  }, 'ancre groupe');
}

// Présence automatique : préférer l'ancienne ligne si elle existe, sinon
// s'accrocher structurellement juste avant le calcul _senderIsAdmin.
if (!src.includes(PRESENCE_MARKER)) {
  const oldPresence = "    if (config.autoTyping) await sock.sendPresenceUpdate('composing', from);";
  if (src.includes(oldPresence)) {
    src = src.replace(
      oldPresence,
      `    // ${PRESENCE_MARKER}\n    await require('./utils/featurePackRuntime').applyAutoPresence(sock, from);`
    );
  } else if (src.includes('applyAutoPresence(sock, from)')) {
    const presenceRegex = /(^[ \t]*.*applyAutoPresence\(sock,\s*from\).*?$)/m;
    src = replaceUniqueRegex(
      src,
      presenceRegex,
      `    // ${PRESENCE_MARKER}\n$1`,
      'présence déjà installée'
    );
  } else {
    const senderAdminRegex = /(^[ \t]*const _senderIsAdmin = isGroup \? await isAdmin\(sock, sender, from, groupMetadata\) : false;)/m;
    src = replaceUniqueRegex(
      src,
      senderAdminRegex,
      `    // ${PRESENCE_MARKER}\n    await require('./utils/featurePackRuntime').applyAutoPresence(sock, from);\n\n$1`,
      'ancre présence de secours'
    );
  }
}

// AntiWaLink : ne plus dépendre de la forme de l'appel AntiLink. Le wrapper
// transforme AntiLink en bloc multi-lignes avant ce script, ce qui cassait
// l'ancienne ancre. On s'insère directement après antigroupmention.
if (!src.includes('handleAntiwalink(sock, msg, groupMetadata)')) {
  const antiGroupMentionRegex = /(^[ \t]*if \(groupSettings\.antigroupmention[^\r\n]*handleAntigroupmention\(sock, msg, groupMetadata\);[^\r\n]*\r?$)/m;
  src = replaceUniqueRegex(
    src,
    antiGroupMentionRegex,
    `$1\n      if (groupSettings.antiwalink && !msg.key.fromMe && _hasText) {\n        let waLinkHandled = false;\n        try {\n          waLinkHandled = await require('./utils/featurePackRuntime').handleAntiwalink(sock, msg, groupMetadata);\n        } catch (_) {}\n        if (waLinkHandled) return;\n      }`,
    'ancre AntiWaLink'
  );
}

fs.writeFileSync(handlerPath, src, 'utf8');

for (const file of [handlerPath, runtimePath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[feature-pack] syntaxe ${path.basename(file)}: ${check.stderr || check.stdout}`);
  }
}

const final = fs.readFileSync(handlerPath, 'utf8');
for (const invariant of [
  GROUP_MARKER,
  PRESENCE_MARKER,
  'handleAdminAtAll({',
  'handleAntiwalink(sock, msg, groupMetadata)',
  'applyAutoPresence(sock, from)',
  'if (waLinkHandled) return;',
]) {
  if (!final.includes(invariant)) throw new Error('[feature-pack] invariant absent: ' + invariant);
}

const groupPos = final.indexOf(GROUP_MARKER);
const nonCommandPos = final.indexOf('if (!isCommand) return;');
if (groupPos < 0 || nonCommandPos < 0 || groupPos > nonCommandPos) {
  throw new Error('[feature-pack] @all reste placé après le retour non-commande');
}

console.log('[feature-pack] ✅ présence auto + @all admin + antiwalink branchés avec ancres structurelles');
