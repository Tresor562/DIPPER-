'use strict';

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

async function probe(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
      redirect: 'follow',
    });
    return response.ok;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ status: 'error' });
  }

  const backends = getBackends();
  for (let index = 0; index < backends.length; index += 1) {
    try {
      if (await probe(backends[index])) {
        if (req.method === 'HEAD') return res.status(200).end();
        return res.status(200).json({ status: 'ok', gateway: 'vercel', backendReachable: true });
      }
    } catch (_) {}
  }

  if (req.method === 'HEAD') return res.status(503).end();
  return res.status(503).json({ status: 'degraded', gateway: 'vercel', backendReachable: false });
};
