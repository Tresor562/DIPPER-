'use strict';

const { spawn } = require('child_process');

const MAX_LOG_CHARS = Number(process.env.DEPLOY_LOG_MAX_CHARS || 16000);
const DEFAULT_TIMEOUT_MS = Number(process.env.DEPLOY_TIMEOUT_MS || 15 * 60 * 1000);

const state = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  signal: null,
  error: null,
  log: '',
};

function appendLog(chunk) {
  const text = String(chunk || '');
  if (!text) return;
  state.log += text;
  if (state.log.length > MAX_LOG_CHARS) {
    state.log = state.log.slice(state.log.length - MAX_LOG_CHARS);
  }
}

function snapshot() {
  return {
    configured: !!String(process.env.DIPPER_DEPLOY_COMMAND || '').trim(),
    status: state.status,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    exitCode: state.exitCode,
    signal: state.signal,
    error: state.error,
    log: state.log,
  };
}

function triggerDeploy() {
  const command = String(process.env.DIPPER_DEPLOY_COMMAND || '').trim();
  if (!command) {
    const err = new Error('DIPPER_DEPLOY_COMMAND n’est pas configuré sur le serveur.');
    err.code = 'DEPLOY_NOT_CONFIGURED';
    throw err;
  }
  if (state.status === 'running') {
    const err = new Error('Un déploiement est déjà en cours.');
    err.code = 'DEPLOY_ALREADY_RUNNING';
    throw err;
  }

  state.status = 'running';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.exitCode = null;
  state.signal = null;
  state.error = null;
  state.log = '';

  const cwd = String(process.env.DIPPER_DEPLOY_WORKDIR || process.cwd()).trim() || process.cwd();
  appendLog(`[deploy] start ${state.startedAt}\n[deploy] cwd: ${cwd}\n`);

  const child = spawn(command, {
    cwd,
    shell: true,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let timeout = null;
  const timeoutMs = Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0
    ? DEFAULT_TIMEOUT_MS
    : 15 * 60 * 1000;

  timeout = setTimeout(() => {
    appendLog(`\n[deploy] timeout après ${timeoutMs}ms — arrêt du processus\n`);
    try { child.kill('SIGTERM'); } catch (_) {}
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
    }, 5000).unref?.();
  }, timeoutMs);
  timeout.unref?.();

  child.stdout?.on('data', appendLog);
  child.stderr?.on('data', appendLog);

  child.on('error', (err) => {
    if (timeout) clearTimeout(timeout);
    state.status = 'failed';
    state.finishedAt = new Date().toISOString();
    state.error = err.message;
    appendLog(`\n[deploy] erreur: ${err.message}\n`);
  });

  child.on('close', (code, signal) => {
    if (timeout) clearTimeout(timeout);
    state.exitCode = code;
    state.signal = signal || null;
    state.finishedAt = new Date().toISOString();
    state.status = code === 0 ? 'success' : 'failed';
    appendLog(`\n[deploy] fin — code=${code} signal=${signal || 'none'}\n`);
  });

  return snapshot();
}

module.exports = {
  snapshot,
  triggerDeploy,
};
