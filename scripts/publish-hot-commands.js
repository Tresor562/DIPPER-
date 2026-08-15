'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function isZeroSha(value) {
  return !value || /^0+$/.test(value);
}

function diffRange(before, after) {
  if (!isZeroSha(before)) return [before, after];
  try {
    const parent = runGit(['rev-parse', `${after}^`]);
    return [parent, after];
  } catch (_) {
    return [after, after];
  }
}

function parseDiff(before, after) {
  const [base, head] = diffRange(before, after);
  if (base === head) return [];
  const raw = runGit(['diff', '--name-status', '--find-renames', base, head]);
  if (!raw) return [];
  return raw.split(/\r?\n/).filter(Boolean).map(line => {
    const parts = line.split('\t');
    const status = parts[0];
    if (/^R\d+/.test(status)) return { status: 'R', oldPath: parts[1], path: parts[2] };
    return { status: status[0], path: parts[1] };
  });
}

function isCommandJs(file) {
  return /^commands\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.js$/.test(file || '');
}

function isSafeCompanion(file) {
  return file === 'AGENTS.md' || /^tests\//.test(file || '') || /^docs\//.test(file || '') || /^\.github\//.test(file || '');
}

function classifyChanges(changes) {
  const runtimeNonHot = [];
  const updates = [];

  for (const change of changes) {
    if (change.status === 'R') {
      if (isCommandJs(change.oldPath) && isCommandJs(change.path)) {
        updates.push({ action: 'delete', path: change.oldPath });
        updates.push({ action: 'upsert', path: change.path });
      } else {
        runtimeNonHot.push(change.oldPath, change.path);
      }
      continue;
    }

    if (isCommandJs(change.path)) {
      if (change.status === 'D') updates.push({ action: 'delete', path: change.path });
      else if (['A', 'M'].includes(change.status)) updates.push({ action: 'upsert', path: change.path });
      else runtimeNonHot.push(change.path);
      continue;
    }

    if (!isSafeCompanion(change.path)) runtimeNonHot.push(change.path);
  }

  return { runtimeNonHot: [...new Set(runtimeNonHot)], updates };
}

function buildPayload(updates, commitSha) {
  return {
    commitSha,
    updates: updates.map(update => {
      if (update.action === 'delete') return update;
      return {
        ...update,
        sourceBase64: fs.readFileSync(update.path).toString('base64'),
      };
    }),
  };
}

async function postWithRetry(endpoint, token, payload) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hot-update-token': token,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch (_) { body = { raw: text.slice(0, 1000) }; }
      if (response.ok) return body;

      const error = new Error(`HTTP ${response.status}: ${body?.error || ''} ${body?.message || ''}`.trim());
      error.status = response.status;
      if (response.status < 500 || attempt === 3) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === 3 || (error.status && error.status < 500)) throw error;
    } finally {
      clearTimeout(timer);
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 5000));
  }
  throw lastError || new Error('Publication HOT impossible.');
}

async function main() {
  const before = process.env.BEFORE_SHA || '';
  const after = process.env.AFTER_SHA || runGit(['rev-parse', 'HEAD']);
  const endpoint = String(process.env.HOT_UPDATE_ENDPOINT || '').replace(/\/$/, '');
  const token = String(process.env.HOT_UPDATE_TOKEN || '');
  const changes = parseDiff(before, after);
  const { runtimeNonHot, updates } = classifyChanges(changes);

  if (runtimeNonHot.length) {
    console.log('[hot-publish] Commit classé CORE : fichiers runtime hors commands/** détectés.');
    for (const file of runtimeNonHot) console.log(`  - ${file}`);
    console.log('[hot-publish] Publication à chaud volontairement ignorée; un déploiement CORE candidat est requis.');
    return;
  }

  if (!updates.length) {
    console.log('[hot-publish] Aucun fichier commands/**/*.js à publier.');
    return;
  }

  if (!endpoint) throw new Error('HOT_UPDATE_ENDPOINT manquant.');
  if (!token) throw new Error('HOT_UPDATE_TOKEN (ou secret API_INTERNAL_TOKEN réutilisé) manquant dans GitHub Actions.');

  const payload = buildPayload(updates, after);
  console.log(`[hot-publish] ${payload.updates.length} changement(s) HOT validé(s), publication vers le runtime actif...`);
  const result = await postWithRetry(`${endpoint}/internal/hot-command`, token, payload);
  console.log(`[hot-publish] ✅ Activation HOT confirmée pour ${result?.updates?.length || payload.updates.length} fichier(s).`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('[hot-publish] ❌', error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = { parseDiff, classifyChanges, buildPayload, isCommandJs, isSafeCompanion };
