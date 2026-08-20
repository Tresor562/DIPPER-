'use strict';

/**
 * Vercel mirror gateway for THE BIG DIPPER.
 *
 * The browser always calls this same-origin function through /pair.
 * This function then talks to the persistent WhatsApp backend on Render.
 * Result: visitors never need to resolve or contact onrender.com directly.
 */

const DEFAULT_BACKENDS = [
  'https://the-big-dipper.onrender.com',
  'https://the-big-dipper.zone.id',
];

function getBackends() {
  const configured = [
    process.env.DIPPER_BACKEND_URL,
    process.env.DIPPER_BACKEND_FALLBACK_URL,
    ...DEFAULT_BACKENDS,
  ]
    .filter(Boolean)
    .map((value) => String(value).replace(/\/+$/, ''));

  return [...new Set(configured)];
}

function getClientIp(req) {
  const value =
    req.headers['x-vercel-forwarded-for'] ||
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    '';
  return String(value).split(',')[0].trim();
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body);
  }
  return {};
}

async function callBackend(baseUrl, payload, clientIp) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    // Preserve the real visitor as the anti-abuse/cooldown identity used by
    // the Render API instead of making all Vercel users share one IP.
    if (clientIp) headers['x-forwarded-for'] = clientIp;

    const response = await fetch(`${baseUrl}/pair`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'follow',
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      const error = new Error('Backend returned a non-JSON response.');
      error.code = 'BAD_BACKEND_RESPONSE';
      error.status = response.status;
      throw error;
    }

    return { status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST is allowed.',
    });
  }

  let body;
  try {
    body = parseBody(req);
  } catch (_) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: 'Invalid JSON body.',
    });
  }

  if (!body.phoneNumber) {
    return res.status(400).json({
      error: 'MISSING_PHONE_NUMBER',
      message: 'The field "phoneNumber" is required.',
    });
  }

  const payload = {
    ...body,
    origin: 'vercel',
  };
  const clientIp = getClientIp(req);
  const backends = getBackends();
  let lastError = null;

  for (let index = 0; index < backends.length; index += 1) {
    const backend = backends[index];
    try {
      const result = await callBackend(backend, payload, clientIp);

      // Business/client errors are authoritative: retrying another hostname
      // would only duplicate the same pairing request. Server/network errors
      // may legitimately benefit from the alternate hostname.
      if (result.status < 500 || index === backends.length - 1) {
        return res.status(result.status).json(result.data);
      }

      lastError = new Error(`Backend ${index + 1} returned HTTP ${result.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  console.error('[vercel-mirror] /pair: all backends unavailable', lastError && lastError.message);
  return res.status(502).json({
    error: 'NETWORK',
    message: 'Pairing service is temporarily unreachable. Please try another mirror or try again shortly.',
  });
};
