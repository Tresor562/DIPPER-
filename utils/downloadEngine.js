'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

const MAX_BYTES = Number(process.env.DOWNLOAD_MAX_BYTES || 45 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS || 30000);
const USER_AGENT = 'Mozilla/5.0 (compatible; THE_BIG_DIPPER/1.0; WhatsApp file utility)';

function tmp(name = 'file.bin') {
  const safe = path.basename(String(name || 'file.bin')).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'file.bin';
  return path.join(os.tmpdir(), `dipper-dl-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safe}`);
}

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
  }
  const p = ip.split('.').map(Number);
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || p[0] === 169 && p[1] === 254 || p[0] === 172 && p[1] >= 16 && p[1] <= 31 || p[0] === 192 && p[1] === 168 || p[0] >= 224;
}

async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new Error('URL invalide.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Seuls HTTP/HTTPS sont autorisés.');
  if (u.username || u.password) throw new Error('Les URL avec identifiants intégrés sont refusées.');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Hôte local/interne refusé.');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Adresse réseau privée/interne refusée.');
  } else {
    const records = await dns.lookup(host, { all: true });
    if (!records.length || records.some(r => isPrivateIp(r.address))) throw new Error('Hôte non public refusé.');
  }
  return u;
}

function fileNameFromHeaders(url, headers = {}) {
  const cd = String(headers['content-disposition'] || '');
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = cd.match(/filename="?([^";]+)"?/i);
  let name = star?.[1] ? decodeURIComponent(star[1]) : plain?.[1];
  if (!name) {
    try { name = path.basename(new URL(url).pathname) || 'download.bin'; } catch { name = 'download.bin'; }
  }
  return path.basename(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 140) || 'download.bin';
}

async function requestFollowingPublicRedirects(url, options = {}) {
  let current = String(url);
  for (let i = 0; i < 6; i++) {
    await assertPublicUrl(current);
    const res = await axios({
      url: current,
      method: options.method || 'GET',
      responseType: options.responseType || 'stream',
      timeout: TIMEOUT_MS,
      maxRedirects: 0,
      validateStatus: s => s >= 200 && s < 400,
      headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(res.headers.location, current).toString();
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error('Trop de redirections.');
}

async function headInfo(url) {
  try {
    const { res, finalUrl } = await requestFollowingPublicRedirects(url, { method: 'HEAD', responseType: 'text' });
    return {
      finalUrl,
      status: res.status,
      contentType: String(res.headers['content-type'] || 'application/octet-stream').split(';')[0],
      size: Number(res.headers['content-length'] || 0),
      fileName: fileNameFromHeaders(finalUrl, res.headers),
      headers: res.headers,
    };
  } catch {
    const { res, finalUrl } = await requestFollowingPublicRedirects(url, { method: 'GET', responseType: 'stream', headers: { Range: 'bytes=0-0' } });
    try { res.data.destroy?.(); } catch (_) {}
    return {
      finalUrl,
      status: res.status,
      contentType: String(res.headers['content-type'] || 'application/octet-stream').split(';')[0],
      size: Number(res.headers['content-range']?.split('/')?.pop() || res.headers['content-length'] || 0),
      fileName: fileNameFromHeaders(finalUrl, res.headers),
      headers: res.headers,
    };
  }
}

async function download(url, opts = {}) {
  const maxBytes = Number(opts.maxBytes || MAX_BYTES);
  const { res, finalUrl } = await requestFollowingPublicRedirects(url, { responseType: 'stream' });
  const declared = Number(res.headers['content-length'] || 0);
  if (declared && declared > maxBytes) { try { res.data.destroy(); } catch (_) {} throw new Error(`Fichier trop volumineux (${Math.ceil(declared/1024/1024)} Mo ; limite ${Math.ceil(maxBytes/1024/1024)} Mo).`); }
  const fileName = opts.fileName || fileNameFromHeaders(finalUrl, res.headers);
  const file = tmp(fileName);
  const out = fs.createWriteStream(file);
  let bytes = 0;
  try {
    for await (const chunk of res.data) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new Error(`Téléchargement interrompu : limite ${Math.ceil(maxBytes/1024/1024)} Mo dépassée.`);
      if (!out.write(chunk)) await new Promise(resolve => out.once('drain', resolve));
    }
    await new Promise((resolve, reject) => out.end(err => err ? reject(err) : resolve()));
  } catch (e) {
    out.destroy();
    try { fs.unlinkSync(file); } catch (_) {}
    throw e;
  }
  return { file, fileName, bytes, finalUrl, contentType: String(res.headers['content-type'] || 'application/octet-stream').split(';')[0] };
}

async function resolveMediafire(url) {
  await assertPublicUrl(url);
  const res = await axios.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT }, maxRedirects: 4 });
  const $ = cheerio.load(res.data);
  const direct = $('#downloadButton').attr('href') || $('a.input.popsok').attr('href') || $('a[href*="download"]#downloadButton').attr('href');
  if (!direct) throw new Error('Lien de téléchargement MediaFire introuvable ou page protégée.');
  await assertPublicUrl(direct);
  return direct;
}

function normalizeHostedUrl(raw, hostHint) {
  const u = new URL(String(raw));
  const h = u.hostname.toLowerCase();
  if (hostHint === 'dropbox' || h.endsWith('dropbox.com')) { u.searchParams.set('dl', '1'); return u.toString(); }
  if (hostHint === 'gdrive' || h.includes('drive.google.com')) {
    const id = u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || u.searchParams.get('id');
    if (id) return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  }
  if (hostHint === 'githubdl' || h === 'github.com') {
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  }
  return u.toString();
}

async function resolveUrl(raw, hint = '') {
  const url = String(raw || '').trim();
  if (!url) throw new Error('Lien requis.');
  const u = await assertPublicUrl(url);
  if (hint === 'mediafire' || u.hostname.toLowerCase().includes('mediafire.com')) return resolveMediafire(url);
  return normalizeHostedUrl(url, hint);
}

async function githubRepoInfo(spec) {
  let owner, repo;
  const raw = String(spec || '').trim();
  try {
    const u = new URL(raw);
    if (u.hostname === 'github.com') [owner, repo] = u.pathname.split('/').filter(Boolean);
  } catch {}
  if (!owner || !repo) [owner, repo] = raw.replace(/^@/, '').split('/');
  if (!owner || !repo) throw new Error('Format attendu : owner/repo');
  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.replace(/\.git$/,''))}`;
  await assertPublicUrl(api);
  const res = await axios.get(api, { timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' } });
  return res.data;
}

async function githubReleases(spec) {
  const repo = await githubRepoInfo(spec);
  const url = `${repo.url}/releases?per_page=10`;
  const res = await axios.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' } });
  return { repo, releases: res.data };
}

async function npmInfo(name) {
  const n = encodeURIComponent(String(name || '').trim());
  if (!n) throw new Error('Nom du package requis.');
  const res = await axios.get(`https://registry.npmjs.org/${n}`, { timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } });
  return res.data;
}

async function pypiInfo(name) {
  const n = encodeURIComponent(String(name || '').trim());
  if (!n) throw new Error('Nom du package requis.');
  const res = await axios.get(`https://pypi.org/pypi/${n}/json`, { timeout: TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } });
  return res.data;
}

function cleanup(...files) { for (const f of files.flat().filter(Boolean)) { try { fs.unlinkSync(f); } catch (_) {} } }
function human(bytes) { const b=Number(bytes)||0; if(b<1024)return `${b} o`; if(b<1048576)return `${(b/1024).toFixed(1)} Ko`; return `${(b/1048576).toFixed(2)} Mo`; }

module.exports = { MAX_BYTES, assertPublicUrl, headInfo, download, resolveUrl, resolveMediafire, githubRepoInfo, githubReleases, npmInfo, pypiInfo, cleanup, human };
