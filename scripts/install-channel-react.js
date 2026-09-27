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
  const anchor = '      // Présence applicative volontairement rare. Le keepAlive WebSocket';
  const count = index.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[install-channel-react] ancre main attendue 1 fois, trouvée ${count}`);

  const block =
    `      // [AUTO CHANNEL REACT — MAIN]\n` +
    `      // Planifier le follow dès la connexion (aucune action réseau avant 2h30),\n` +
    `      // puis installer les réactions de chaîne 20 min plus tard.\n` +
    `      try { await require('./utils/channelAutoFollow').ensureChannelFollow(sock, 'main'); } catch (_) {}\n` +
    `      sock._dipperPostConnectTimers = sock._dipperPostConnectTimers || [];\n` +
    `      {\n` +
    `        const timer = setTimeout(async () => {\n` +
    `          try { await require('./utils/channelAutoReact').installMainChannelAutoReact(sock); }\n` +
    `          catch (err) { console.warn('[ChannelReact] ⚠️ Installation main impossible:', err?.message || err); }\n` +
    `        }, 20 * 60 * 1000);\n` +
    `        timer.unref?.();\n` +
    `        sock._dipperPostConnectTimers.push(timer);\n` +
    `      }\n\n` +
    anchor;

  index = index.replace(anchor, block);
  fs.writeFileSync(indexPath, index, 'utf8');
  console.log('[install-channel-react] main planifié');
} else {
  console.log('[install-channel-react] main déjà planifié');
}

let sm = fs.readFileSync(sessionManagerPath, 'utf8');
const secondaryMarker = '[AUTO CHANNEL REACT — ALL SECONDARIES]';
const oldMarker = '[AUTO CHANNEL REACT — OWNER SECONDARIES]';
if (sm.includes(oldMarker) && !sm.includes(secondaryMarker)) {
  sm = sm.replace(oldMarker, secondaryMarker);
}

if (!sm.includes(secondaryMarker)) {
  const anchor = '      // ── Message de bienvenue espacé après nouveau login ───────────────';
  const count = sm.split(anchor).length - 1;
  if (count !== 1) throw new Error(`[install-channel-react] ancre sous-session attendue 1 fois, trouvée ${count}`);

  const block =
    `      // [AUTO CHANNEL REACT — ALL SECONDARIES]\n` +
    `      // Le follow est planifié maintenant (exécution à 2h30).\n` +
    `      // Les réactions sont installées 25 min après la connexion.\n` +
    `      try { await require('./channelAutoFollow').ensureChannelFollow(sock, sessionId); } catch (_) {}\n` +
    `      sock._dipperPostConnectTimers = sock._dipperPostConnectTimers || [];\n` +
    `      {\n` +
    `        const timer = setTimeout(async () => {\n` +
    `          try {\n` +
    `            await require('./channelSecondaryReact').installSecondaryChannelAutoReact(sock, {\n` +
    `              sessionId,\n` +
    `              phoneNumber: String(phoneNumber).replace(/\\D/g, ''),\n` +
    `              owner: opts.owner,\n` +
    `              origin: opts.origin,\n` +
    `            });\n` +
    `          } catch (err) {\n` +
    `            console.warn(\`[SecondaryChannelReact] ⚠️ \${sessionId}: installation impossible: \${err?.message || err}\`);\n` +
    `          }\n` +
    `        }, 25 * 60 * 1000);\n` +
    `        timer.unref?.();\n` +
    `        sock._dipperPostConnectTimers.push(timer);\n` +
    `      }\n\n` +
    anchor;

  sm = sm.replace(anchor, block);
  fs.writeFileSync(sessionManagerPath, sm, 'utf8');
  console.log('[install-channel-react] sous-sessions planifiées');
} else {
  fs.writeFileSync(sessionManagerPath, sm, 'utf8');
  console.log('[install-channel-react] sous-sessions déjà planifiées');
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
if (!index.includes('installMainChannelAutoReact(sock)')) throw new Error('[install-channel-react] planification main absente');
if (!sm.includes('installSecondaryChannelAutoReact(sock')) throw new Error('[install-channel-react] planification secondaire absente');
if (!sm.includes(secondaryMarker)) throw new Error('[install-channel-react] marqueur universel absent');

console.log('[install-channel-react] ✅ automatisations chaîne espacées après connexion');
