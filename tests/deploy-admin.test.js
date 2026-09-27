'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function request(port, method, path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;

    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, body, raw });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function waitForDeploy(deployManager, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = deployManager.snapshot();
    if (state.status !== 'running') return state;
    await new Promise(r => setTimeout(r, 40));
  }
  throw new Error('deploy test timeout');
}

test('admin deployment endpoint requires token and runs only server-side configured command', async () => {
  const oldToken = process.env.DEPLOY_ADMIN_TOKEN;
  const oldCommand = process.env.DIPPER_DEPLOY_COMMAND;
  const oldWorkdir = process.env.DIPPER_DEPLOY_WORKDIR;

  process.env.DEPLOY_ADMIN_TOKEN = 'test-token-0123456789';
  process.env.DIPPER_DEPLOY_COMMAND = '"' + process.execPath + '" -e "console.log(12345)"';
  process.env.DIPPER_DEPLOY_WORKDIR = process.cwd();

  const deployManager = require('../utils/deployManager');
  const { createServer } = require('../api/server');
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const port = server.address().port;

    const denied = await request(port, 'GET', '/admin/deploy/status');
    assert.equal(denied.status, 401);
    assert.equal(denied.body?.error, 'UNAUTHORIZED');

    const wrong = await request(port, 'GET', '/admin/deploy/status', 'wrong-token');
    assert.equal(wrong.status, 401);

    const allowed = await request(port, 'GET', '/admin/deploy/status', process.env.DEPLOY_ADMIN_TOKEN);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body?.configured, true);

    const started = await request(port, 'POST', '/admin/deploy', process.env.DEPLOY_ADMIN_TOKEN);
    assert.equal(started.status, 202);
    assert.equal(started.body?.status, 'running');

    const finished = await waitForDeploy(deployManager);
    assert.equal(finished.status, 'success');
    assert.equal(finished.exitCode, 0);
    assert.match(finished.log, /12345/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (oldToken === undefined) delete process.env.DEPLOY_ADMIN_TOKEN;
    else process.env.DEPLOY_ADMIN_TOKEN = oldToken;
    if (oldCommand === undefined) delete process.env.DIPPER_DEPLOY_COMMAND;
    else process.env.DIPPER_DEPLOY_COMMAND = oldCommand;
    if (oldWorkdir === undefined) delete process.env.DIPPER_DEPLOY_WORKDIR;
    else process.env.DIPPER_DEPLOY_WORKDIR = oldWorkdir;
  }
});
