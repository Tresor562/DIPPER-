'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const menuPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(ROOT, 'commands', 'general_tools', 'menu.js');
const reportPath = process.argv[3]
  ? path.resolve(process.cwd(), process.argv[3])
  : path.join(ROOT, 'menu-image-audit.json');

function stripFullLineComments(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function extractUrls(text) {
  const urls = [];
  const clean = stripFullLineComments(text);
  const re = /['"](https?:\/\/[^'"\s]+)['"]/g;
  let match;
  while ((match = re.exec(clean))) urls.push(match[1]);
  return [...new Set(urls)];
}

function readStyleUrls(file) {
  if (!fs.existsSync(file)) throw new Error(`[menu-images] menu introuvable: ${file}`);
  const source = fs.readFileSync(file, 'utf8');
  const block = source.match(/const\s+STYLE_IMAGE_URLS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) throw new Error('[menu-images] bloc STYLE_IMAGE_URLS introuvable');

  const styles = new Map();
  const styleRe = /^\s*(\d+)\s*:\s*\[([\s\S]*?)^\s*\],?/gm;
  let match;
  while ((match = styleRe.exec(block[1]))) {
    styles.set(Number(match[1]), extractUrls(match[2]));
  }

  return styles;
}

async function checkUrl(style, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 THE-BIG-DIPPER-image-audit' }
    });
    const contentType = response.headers.get('content-type') || '';
    const bytes = (await response.arrayBuffer()).byteLength;
    const ok = response.ok && /^image\//i.test(contentType) && bytes > 1000;
    return {
      style,
      url,
      ok,
      status: response.status,
      contentType,
      bytes,
      finalUrl: response.url,
      error: ok
        ? null
        : (!response.ok
          ? `HTTP ${response.status}`
          : !/^image\//i.test(contentType)
            ? `content-type ${contentType || 'absent'}`
            : `image trop petite (${bytes} octets)`)
    };
  } catch (err) {
    return {
      style,
      url,
      ok: false,
      status: null,
      contentType: '',
      bytes: 0,
      finalUrl: null,
      error: err.name === 'AbortError' ? 'timeout' : err.message
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, concurrency = 8) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      results[index] = await checkUrl(item.style, item.url);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, worker));
  return results;
}

(async () => {
  const styles = readStyleUrls(menuPath);
  const missingStyles = [];
  const items = [];

  for (let style = 0; style <= 20; style++) {
    const urls = styles.get(style) || [];
    if (!urls.length) missingStyles.push(style);
    for (const url of urls) items.push({ style, url });
  }

  const results = await runPool(items);
  for (const r of results) {
    console.log(
      `[menu-images] style=${r.style} ${r.ok ? 'OK' : 'KO'} ${r.url} ` +
      `HTTP=${r.status ?? '-'} bytes=${r.bytes} type=${r.contentType || '-'}${r.error ? ` error=${r.error}` : ''}`
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile: path.relative(ROOT, menuPath) || path.basename(menuPath),
    missingStyles,
    total: results.length,
    ok: results.filter(r => r.ok).length,
    ko: results.filter(r => !r.ok).length,
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(
    `[menu-images] TOTAL=${report.total} OK=${report.ok} KO=${report.ko} ` +
    `SANS_IMAGE=${missingStyles.join(',') || 'aucun'} source=${report.sourceFile}`
  );

  // L'audit d'images est informatif : un hébergeur externe peut être temporairement
  // indisponible. Le rapport garde les KO sans bloquer les autres audits/commandes.
})().catch(err => {
  console.error('[menu-images] audit fatal:', err.stack || err.message);
  process.exit(1);
});
