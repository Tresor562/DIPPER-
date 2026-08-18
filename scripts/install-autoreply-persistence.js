'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HANDLER = path.join(ROOT, 'handler.js');
const REPLY = path.join(ROOT, 'commands', 'bot_sovereignty', 'reply.js');
const MARK = '[AUTOREPLY MONGO PERSISTENCE]';

function check(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`[autoreply-persist] syntaxe invalide ${path.relative(ROOT, file)}: ${r.stderr || r.stdout}`);
}

function patchHandler() {
  let src = fs.readFileSync(HANDLER, 'utf8');
  if (!src.includes("require('./utils/autoreplyStore')")) {
    const requireAnchor = "const sessionContext = require('./utils/sessionContext');";
    if (src.includes(requireAnchor)) {
      src = src.replace(requireAnchor, `${requireAnchor}\nconst autoreplyStore = require('./utils/autoreplyStore'); // ${MARK}`);
    } else {
      const pos = src.indexOf("'use strict';");
      if (pos < 0) throw new Error('[autoreply-persist] préambule handler introuvable');
      const eol = src.indexOf('\n', pos);
      src = src.slice(0, eol + 1) + `const autoreplyStore = require('./utils/autoreplyStore'); // ${MARK}\n` + src.slice(eol + 1);
    }
  }

  if (!src.includes('[AUTOREPLY PERSISTENT LOAD]')) {
    const anchor = '          arCfg = getArCfgCached();';
    if (!src.includes(anchor)) throw new Error('[autoreply-persist] chargement arCfg introuvable');
    src = src.replace(anchor, `${anchor}\n\n          // [AUTOREPLY PERSISTENT LOAD]\n          // Si le fichier local a disparu après un redeploy Render, restaurer\n          // automatiquement la configuration + le média depuis MongoDB GridFS.\n          const _arSid = sessionContext.getCurrentSessionId();\n          const _expectedLocal = arCfg?.localPath || path.join(process.cwd(), 'database', 'sessions', _arSid, 'autoreply_video.mp4');\n          const _localMissing = !!(arCfg?.active && !fs.existsSync(_expectedLocal));\n          if (!arCfg?.active || _localMissing) {\n            try {\n              const persisted = await autoreplyStore.load(_arSid);\n              if (persisted?.active && Buffer.isBuffer(persisted.buffer)) {\n                arCfg = { ...persisted, _persistentBuffer: persisted.buffer, localPath: null };\n                console.log('[autoReply] ✅ note vidéo restaurée depuis MongoDB — session:', _arSid);\n              }\n            } catch (persistErr) {\n              console.warn('[autoReply] stockage persistant indisponible:', persistErr.message);\n            }\n          }`);
  }

  if (!src.includes('[AUTOREPLY PERSISTENT MEDIA BUFFER]')) {
    const existsLog = "            console.log(`[autoReply] 📁 Fichier existe: ${fs.existsSync(mediaFilePath)}`);";
    if (!src.includes(existsLog)) throw new Error('[autoreply-persist] log fichier autoreply introuvable');
    src = src.replace(existsLog, `            const _persistentMediaBuf = Buffer.isBuffer(arCfg?._persistentBuffer) ? arCfg._persistentBuffer : null;\n            const _mediaAvailable = !!_persistentMediaBuf || fs.existsSync(mediaFilePath);\n            console.log(\`[autoReply] 📁 Média disponible: \${_mediaAvailable} | source: \${_persistentMediaBuf ? 'MongoDB' : 'disque'}\`); // [AUTOREPLY PERSISTENT MEDIA BUFFER]`);

    src = src.replace('            if (!fs.existsSync(mediaFilePath)) {', '            if (!_mediaAvailable) {');
    src = src.replace('                const mediaBuf  = await fs.promises.readFile(mediaFilePath);', '                const mediaBuf  = _persistentMediaBuf || await fs.promises.readFile(mediaFilePath);');
  }

  fs.writeFileSync(HANDLER, src, 'utf8');
  check(HANDLER);
}

function patchReply() {
  let src = fs.readFileSync(REPLY, 'utf8');
  if (!src.includes("require('../../utils/autoreplyStore')")) {
    const anchor = "const sessionContext = require('../../utils/sessionContext');";
    if (!src.includes(anchor)) throw new Error('[autoreply-persist] import sessionContext reply introuvable');
    src = src.replace(anchor, `${anchor}\nconst autoreplyStore = require('../../utils/autoreplyStore'); // ${MARK}`);
  }

  if (!src.includes('[AUTOREPLY PERSISTENT SAVE]')) {
    const anchor = '      saveMeta(meta);';
    if (!src.includes(anchor)) throw new Error('[autoreply-persist] saveMeta reply introuvable');
    src = src.replace(anchor, `${anchor}\n\n      // [AUTOREPLY PERSISTENT SAVE]\n      // La copie locale reste le cache rapide. MongoDB GridFS est la source\n      // durable qui survit aux redéploiements et changements d'instance.\n      try {\n        await autoreplyStore.save(sessionContext.getCurrentSessionId(), buf, meta);\n        console.log('[reply] ✅ média sauvegardé durablement dans MongoDB');\n      } catch (persistErr) {\n        console.error('[reply] ⚠️ sauvegarde MongoDB échouée — copie locale conservée:', persistErr.message);\n      }`);
  }

  if (!src.includes('[AUTOREPLY PERSISTENT OFF]')) {
    const anchor = "        database.updateGroupSettings(chatId, { autoReply: { active: false } });";
    if (src.includes(anchor)) src = src.replace(anchor, `${anchor}\n        try { await autoreplyStore.setActive(sessionContext.getCurrentSessionId(), false); } catch (_) {} // [AUTOREPLY PERSISTENT OFF]`);
  }

  if (!src.includes('[AUTOREPLY PERSISTENT RESET]')) {
    const resetAnchor = "        [VIDEO_META_PATH(), VIDEO_FILE_PATH(), AUDIO_FILE_PATH(), IMAGE_FILE_PATH()].forEach(f => {";
    if (src.includes(resetAnchor)) src = src.replace(resetAnchor, `        try { await autoreplyStore.remove(sessionContext.getCurrentSessionId()); } catch (_) {} // [AUTOREPLY PERSISTENT RESET]\n${resetAnchor}`);
  }

  fs.writeFileSync(REPLY, src, 'utf8');
  check(REPLY);
}

for (const file of [HANDLER, REPLY]) if (!fs.existsSync(file)) throw new Error('[autoreply-persist] fichier absent: ' + file);
patchHandler();
patchReply();
console.log('[autoreply-persist] ✅ note vidéo persistante MongoDB + restauration automatique installées');
