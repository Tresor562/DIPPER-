'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.js');
const sessionManagerPath = path.join(ROOT, 'utils', 'sessionManager.js');

for (const file of [indexPath, sessionManagerPath]) {
  if (!fs.existsSync(file)) throw new Error(`[install-channel-react] fichier absent: ${file}`);
}

let index = fs.readFileSync(indexPath, 'utf8');
const mainMarker = '[AUTO CHANNEL REACT — MAIN]';
if (!index.includes(mainMarker)) {
  const anchor = '      handler.initializeAntiCall(sock);';
  const count = index.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[install-channel-react] ancre main attendue 1 fois, trouvée ${count}`);
  const block = `${anchor}\n\n      // [AUTO CHANNEL REACT — MAIN]\n      try { await require('./utils/channelAutoFollow').ensureChannelFollow(sock, 'main'); } catch (_) {}\n      try {\n        await require('./utils/channelAutoReact').installMainChannelAutoReact(sock);\n      } catch (err) {\n        console.warn('[ChannelReact] ⚠️ Installation main impossible:', err?.message || err);\n      }`;
  index = index.replace(anchor, block);
  fs.writeFileSync(indexPath, index, 'utf8');
  console.log('[install-channel-react] main activé');
} else {
  console.log('[install-channel-react] main déjà activé');
}

let sm = fs.readFileSync(sessionManagerPath, 'utf8');
const secondaryMarker = '[AUTO CHANNEL REACT — ALL SECONDARIES]';
const oldMarker = '[AUTO CHANNEL REACT — OWNER SECONDARIES]';
if (sm.includes(oldMarker) && !sm.includes(secondaryMarker)) {
  sm = sm.replace(oldMarker, secondaryMarker);
}

if (!sm.includes(secondaryMarker)) {
  const anchor = '      try { handler.initializeAntiCall(sock); } catch {}';
  const count = sm.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[install-channel-react] ancre sous-session attendue 1 fois, trouvée ${count}`);
  const block = `${anchor}\n\n      // [AUTO CHANNEL REACT — ALL SECONDARIES]\n      // Aucun filtre owner/origin : chaque socket secondaire ouvert est couvert.\n      try { await require('./channelAutoFollow').ensureChannelFollow(sock, sessionId); } catch (_) {}\n      try {\n        await require('./channelSecondaryReact').installSecondaryChannelAutoReact(sock, {\n          sessionId,\n          phoneNumber: String(phoneNumber).replace(/\\D/g, ''),\n          owner: opts.owner,\n          origin: opts.origin,\n        });\n      } catch (err) {\n        console.warn(\`[SecondaryChannelReact] ⚠️ \${sessionId}: installation impossible: \${err?.message || err}\`);\n      }`;
  sm = sm.replace(anchor, block);
  fs.writeFileSync(sessionManagerPath, sm, 'utf8');
  console.log('[install-channel-react] toutes les sous-sessions activées');
} else {
  fs.writeFileSync(sessionManagerPath, sm, 'utf8');
  console.log('[install-channel-react] sous-sessions déjà activées');
}

for (const file of [
  indexPath,
  sessionManagerPath,
  path.join(ROOT, 'utils', 'channelAutoFollow.js'),
  path.join(ROOT, 'utils', 'channelAutoReact.js'),
  path.join(ROOT, 'utils', 'channelSecondaryReact.js'),
]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[install-channel-react] syntaxe invalide ${path.relative(ROOT, file)}: ${check.stderr || check.stdout}`);
}

index = fs.readFileSync(indexPath, 'utf8');
sm = fs.readFileSync(sessionManagerPath, 'utf8');
if (!index.includes('installMainChannelAutoReact(sock)')) throw new Error('[install-channel-react] listener main absent');
if (!sm.includes('installSecondaryChannelAutoReact(sock')) throw new Error('[install-channel-react] listener secondaire absent');
if (!sm.includes(secondaryMarker)) throw new Error('[install-channel-react] marqueur universel absent');

console.log('[install-channel-react] ✅ main + toutes les sous-sessions, toutes origines');
