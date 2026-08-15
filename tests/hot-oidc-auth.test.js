'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const auth = require('../utils/hotOidcAuth');

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: auth.GITHUB_OIDC_ISSUER,
    aud: auth.GITHUB_OIDC_AUDIENCE,
    repository: auth.GITHUB_REPOSITORY,
    ref: auth.GITHUB_MAIN_REF,
    event_name: 'push',
    workflow_ref: 'Tresor562/DIPPER-/.github/workflows/hot-command-updates.yml@refs/heads/main',
    sha: 'abc123',
    nbf: now - 5,
    exp: now + 300,
    ...overrides,
  };
}

test('les claims OIDC n’autorisent que le workflow HOT du dépôt DIPPER- sur main', () => {
  const claims = makeClaims();
  assert.equal(auth.validateOidcClaims(claims, { commitSha: 'abc123' }), true);
  assert.throws(() => auth.validateOidcClaims({ ...claims, ref: 'refs/heads/feature/evil' }), /main/);
  assert.throws(() => auth.validateOidcClaims({ ...claims, repository: 'attacker/repo' }), /Repository/);
  assert.throws(() => auth.validateOidcClaims({ ...claims, event_name: 'pull_request' }), /push/);
  assert.throws(() => auth.validateOidcClaims({ ...claims, sha: 'wrong' }, { commitSha: 'abc123' }), /SHA/);
});

test('un JWT RS256 signé avec une clé JWKS GitHub simulée est accepté et une signature falsifiée est rejetée', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'test-key';
  jwk.use = 'sig';
  jwk.alg = 'RS256';

  const header = encode({ alg: 'RS256', typ: 'JWT', kid: 'test-key' });
  const claims = encode(makeClaims());
  const input = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  const token = `${input}.${signature}`;

  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, async json() { return { keys: [jwk] }; } });
  try {
    const verified = await auth.verifyGitHubOidcToken(token, { commitSha: 'abc123' });
    assert.equal(verified.repository, 'Tresor562/DIPPER-');
    assert.equal(verified.ref, 'refs/heads/main');

    const tampered = `${input}.${Buffer.from('bad-signature').toString('base64url')}`;
    await assert.rejects(
      auth.verifyGitHubOidcToken(tampered, { commitSha: 'abc123' }),
      error => error.code === 'HOT_OIDC_INVALID'
    );
  } finally {
    global.fetch = previousFetch;
  }
});
