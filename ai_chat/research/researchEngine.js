'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (compatible; ExauceeResearch/1.1; +https://github.com/Tresor562/DIPPER-)';
const DEFAULT_TIMEOUT = 9000;

function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function stripTracking(url = '') {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) u.searchParams.delete(key);
    u.hash = '';
    return u.toString();
  } catch (_) { return String(url || ''); }
}

function extractUrl(text = '') {
  const match = String(text).match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? stripTracking(match[0].replace(/[.,!?;:]+$/, '')) : null;
}

function words(text = '') {
  return new Set(normalize(text).split(/[^a-z0-9]+/).filter(x => x.length > 2));
}

function relevance(query, item) {
  const q = words(query);
  const t = words(`${item.title || ''} ${item.snippet || ''}`);
  if (!q.size) return 0;
  let hit = 0;
  for (const w of q) if (t.has(w)) hit++;
  return hit / q.size;
}

function safeUrl(raw = '') {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (/^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(u.hostname)) return null;
    return u.toString();
  } catch (_) { return null; }
}

function sentenceFallback(report) {
  const rows = (report?.results || []).slice(0, 5);
  if (!rows.length) return "Je n’ai trouvé aucune source exploitable pour cette recherche.";
  const bullets = rows.map((r, i) => {
    const snippet = String(r.snippet || r.content || '').replace(/\s+/g, ' ').trim().slice(0, 340);
    return `${i + 1}. ${r.title}${snippet ? ` — ${snippet}` : ''}`;
  });
  return `Voilà ce que j’ai pu recouper rapidement :\n\n${bullets.join('\n\n')}`;
}

class ResearchEngine {
  constructor({ timeout = DEFAULT_TIMEOUT, cacheTtlMs = 10 * 60 * 1000, maxResults = 8 } = {}) {
    this.timeout = timeout;
    this.cacheTtlMs = cacheTtlMs;
    this.maxResults = maxResults;
    this.cache = new Map();
    this.http = axios.create({ timeout, maxRedirects: 4, headers: { 'User-Agent': UA, 'Accept-Language': 'fr,en;q=0.8' } });
  }

  needsResearch(text = '') {
    const t = normalize(text);
    return Boolean(extractUrl(text)) || /\b(cherche|recherche|verifie|trouve|sources?|actualite|aujourd'hui|maintenant|recent|derniere?s?|nouvelle?s?|prix|score|classement|meteo|qui est actuellement|en ce moment|lis ce lien|analyse ce lien|resume ce lien)\b/.test(t);
  }

  async searchDuckDuckGo(query) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const { data } = await this.http.get(url, { responseType: 'text' });
    const $ = cheerio.load(data);
    const out = [];
    $('.result').each((_, el) => {
      if (out.length >= this.maxResults) return false;
      const a = $(el).find('.result__a').first();
      const snippet = $(el).find('.result__snippet').first().text().replace(/\s+/g, ' ').trim();
      let href = a.attr('href') || '';
      try {
        const u = new URL(href, 'https://duckduckgo.com');
        href = u.searchParams.get('uddg') || href;
      } catch (_) {}
      const cleaned = safeUrl(stripTracking(href));
      if (cleaned) out.push({ title: a.text().trim(), url: cleaned, snippet, source: 'duckduckgo' });
    });
    return out;
  }

  async searchWikipedia(query, lang = 'fr') {
    const endpoint = `https://${lang === 'en' ? 'en' : 'fr'}.wikipedia.org/w/api.php`;
    const { data } = await this.http.get(endpoint, { params: { action: 'query', list: 'search', srsearch: query, format: 'json', origin: '*' } });
    return (data?.query?.search || []).slice(0, 5).map(row => ({
      title: row.title,
      url: `https://${lang === 'en' ? 'en' : 'fr'}.wikipedia.org/wiki/${encodeURIComponent(String(row.title).replace(/ /g, '_'))}`,
      snippet: cheerio.load(`<div>${row.snippet || ''}</div>`).text(),
      source: 'wikipedia'
    }));
  }

  async fetchPage(url) {
    const safe = safeUrl(url);
    if (!safe) throw new Error('URL non autorisée');
    const { data, headers } = await this.http.get(safe, { responseType: 'text' });
    const type = String(headers['content-type'] || '');
    if (!/html|text\//i.test(type)) return '';
    const $ = cheerio.load(data);
    $('script,style,noscript,nav,footer,header,form,svg,canvas').remove();
    const title = $('title').first().text().replace(/\s+/g, ' ').trim();
    const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
    const text = root.text().replace(/\s+/g, ' ').trim().slice(0, 16000);
    return { title, text };
  }

  async researchUrl(url) {
    const safe = safeUrl(url);
    if (!safe) throw new Error('URL non autorisée');
    const page = await this.fetchPage(safe);
    return {
      query: safe,
      searchedAt: Date.now(),
      directUrl: true,
      results: [{ title: page.title || safe, url: safe, snippet: page.text.slice(0, 500), content: page.text, source: 'direct-url', relevance: 1 }]
    };
  }

  async research(query, { lang = 'fr', deep = true } = {}) {
    const direct = extractUrl(query);
    if (direct) return this.researchUrl(direct);

    const key = `${lang}:${normalize(query)}:${deep ? 1 : 0}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value);

    const settled = await Promise.allSettled([
      this.searchDuckDuckGo(query),
      this.searchWikipedia(query, lang)
    ]);
    const merged = [];
    const seen = new Set();
    for (const s of settled) {
      if (s.status !== 'fulfilled') continue;
      for (const item of s.value) {
        const url = stripTracking(item.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        merged.push({ ...item, url, relevance: relevance(query, item) });
      }
    }
    merged.sort((a, b) => b.relevance - a.relevance);
    const selected = merged.slice(0, this.maxResults);

    if (deep) {
      await Promise.all(selected.slice(0, 4).map(async item => {
        try {
          const page = await this.fetchPage(item.url);
          item.content = page.text;
          if (!item.title && page.title) item.title = page.title;
        } catch (_) { item.content = ''; }
      }));
    }

    const result = { query, searchedAt: Date.now(), results: selected };
    this.cache.set(key, { expiresAt: Date.now() + this.cacheTtlMs, value: result });
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    return structuredClone(result);
  }

  buildContext(report) {
    const rows = (report?.results || []).slice(0, 8).map((r, i) => {
      const body = String(r.content || r.snippet || '').slice(0, 2500);
      return `[Source ${i + 1}] ${r.title}\nURL: ${r.url}\nOrigine: ${r.source}\nContenu: ${body}`;
    });
    return rows.join('\n\n');
  }

  sourceFooter(report, max = 5) {
    const rows = (report?.results || []).slice(0, max);
    if (!rows.length) return '';
    return `Sources consultées :\n${rows.map((r, i) => `${i + 1}. ${r.title} — ${r.url}`).join('\n')}`;
  }

  fallbackSummary(report) { return sentenceFallback(report); }
}

module.exports = { ResearchEngine, safeUrl, relevance, stripTracking, extractUrl, sentenceFallback };