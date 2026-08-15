'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const AUDIENCE = 'the-big-dipper-hot-update';

async function requestGitHubOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) return null;

  const url = new URL(requestUrl);
  url.searchParams.set('audience', AUDIENCE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${requestToken}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub OIDC HTTP ${response.status}`);
    const body = await response.json();
    if (!body?.value) throw new Error("GitHub n'a pas retourné de jeton OIDC.");
    return body.value;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const oidcToken = await requestGitHubOidcToken();
  const fallbackSharedToken = String(process.env.HOT_UPDATE_TOKEN || '');
  const token = oidcToken || fallbackSharedToken;
  if (!token) {
    throw new Error('Authentification HOT absente : permission GitHub id-token: write requise ou HOT_UPDATE_TOKEN de secours.');
  }

  const publisher = path.join(__dirname, 'publish-hot-commands.js');
  const result = spawnSync(process.execPath, [publisher], {
    cwd: process.cwd(),
    env: { ...process.env, HOT_UPDATE_TOKEN: token },
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    timeout: 5 * 60 * 1000,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('[hot-oidc-publish] ❌', error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = { AUDIENCE, requestGitHubOidcToken };
