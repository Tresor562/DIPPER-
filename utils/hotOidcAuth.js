'use strict';

const crypto = require('crypto');

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_JWKS = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const GITHUB_OIDC_AUDIENCE = 'the-big-dipper-hot-update';
const GITHUB_REPOSITORY = 'Tresor562/DIPPER-';
const GITHUB_MAIN_REF = 'refs/heads/main';
const GITHUB_WORKFLOW_PREFIX = 'Tresor562/DIPPER-/.github/workflows/hot-command-updates.yml@';
const JWKS_CACHE_MS = 10 * 60 * 1000;

let jwksCache = null;
let jwksExpiresAt = 0;

function error(code, message) {
  return Object.assign(new Error(message), { code });
}

function decodeJwtPart(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
  } catch (_) {
    throw error('HOT_OIDC_INVALID', 'Jeton OIDC illisible.');
  }
}

function validateOidcClaims(claims, { commitSha = null, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!claims || typeof claims !== 'object') throw error('HOT_OIDC_INVALID', 'Claims OIDC absents.');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

  if (claims.iss !== GITHUB_OIDC_ISSUER) throw error('HOT_OIDC_INVALID', 'Issuer OIDC GitHub invalide.');
  if (!audience.includes(GITHUB_OIDC_AUDIENCE)) throw error('HOT_OIDC_INVALID', 'Audience OIDC invalide.');
  if (claims.repository !== GITHUB_REPOSITORY) throw error('HOT_OIDC_INVALID', 'Repository OIDC non autorisé.');
  if (claims.ref !== GITHUB_MAIN_REF) throw error('HOT_OIDC_INVALID', 'Seule la branche main peut publier en HOT.');
  if (claims.event_name !== 'push') throw error('HOT_OIDC_INVALID', 'Seuls les pushes GitHub peuvent publier en HOT.');
  if (!String(claims.workflow_ref || '').startsWith(GITHUB_WORKFLOW_PREFIX)) {
    throw error('HOT_OIDC_INVALID', 'Workflow GitHub non autorisé.');
  }
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) < now - 5) {
    throw error('HOT_OIDC_INVALID', 'Jeton OIDC expiré.');
  }
  if (Number.isFinite(Number(claims.nbf)) && Number(claims.nbf) > now + 30) {
    throw error('HOT_OIDC_INVALID', 'Jeton OIDC pas encore valide.');
  }
  if (commitSha && claims.sha && String(claims.sha) !== String(commitSha)) {
    throw error('HOT_OIDC_SHA_MISMATCH', 'Le SHA OIDC ne correspond pas au lot HOT.');
  }
  return true;
}

async function getJwks({ force = false } = {}) {
  if (!force && jwksCache && Date.now() < jwksExpiresAt) return jwksCache;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(GITHUB_OIDC_JWKS, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw error('HOT_OIDC_JWKS_FAILED', `JWKS GitHub HTTP ${response.status}.`);
    const body = await response.json();
    if (!Array.isArray(body?.keys) || !body.keys.length) {
      throw error('HOT_OIDC_JWKS_FAILED', 'JWKS GitHub vide.');
    }
    jwksCache = body.keys;
    jwksExpiresAt = Date.now() + JWKS_CACHE_MS;
    return jwksCache;
  } catch (err) {
    if (err?.code) throw err;
    throw error('HOT_OIDC_JWKS_FAILED', `Impossible de vérifier le jeton GitHub: ${err.message || err}`);
  } finally {
    clearTimeout(timer);
  }
}

async function verifyGitHubOidcToken(token, { commitSha = null } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw error('HOT_OIDC_INVALID', 'Format JWT OIDC invalide.');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const claims = decodeJwtPart(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) throw error('HOT_OIDC_INVALID', 'Algorithme ou kid OIDC invalide.');

  let keys = await getJwks();
  let jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) {
    keys = await getJwks({ force: true });
    jwk = keys.find(key => key.kid === header.kid);
  }
  if (!jwk) throw error('HOT_OIDC_INVALID', 'Clé publique GitHub introuvable.');

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch (err) {
    throw error('HOT_OIDC_INVALID', `Clé publique GitHub invalide: ${err.message}`);
  }

  const signatureValid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    Buffer.from(encodedSignature, 'base64url')
  );
  if (!signatureValid) throw error('HOT_OIDC_INVALID', 'Signature OIDC GitHub invalide.');

  validateOidcClaims(claims, { commitSha });
  return claims;
}

function configuredSharedToken() {
  return String(process.env.HOT_UPDATE_TOKEN || process.env.API_INTERNAL_TOKEN || '');
}

function verifySharedToken(provided) {
  const expected = configuredSharedToken();
  const actual = String(provided || '');
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function authorizeHotRequest({ token, commitSha = null } = {}) {
  const supplied = String(token || '').trim();
  if (!supplied) throw error('HOT_UNAUTHORIZED', 'Authentification HOT manquante.');

  if (verifySharedToken(supplied)) {
    return { mode: 'shared-token', claims: null };
  }

  if (supplied.split('.').length === 3) {
    const claims = await verifyGitHubOidcToken(supplied, { commitSha });
    return { mode: 'github-oidc', claims };
  }

  throw error('HOT_UNAUTHORIZED', 'Authentification HOT invalide.');
}

module.exports = {
  GITHUB_OIDC_ISSUER,
  GITHUB_OIDC_JWKS,
  GITHUB_OIDC_AUDIENCE,
  GITHUB_REPOSITORY,
  GITHUB_MAIN_REF,
  validateOidcClaims,
  verifyGitHubOidcToken,
  authorizeHotRequest,
  verifySharedToken,
};
