'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('pairing web is served by the same DIPPER process', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'api', 'server.js'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');

  assert.match(app, /var PAIR_ENDPOINT = '\/pair';/);
  assert.match(app, /fetch\(PAIR_ENDPOINT/);
  assert.match(app, /origin: 'web'/);

  assert.doesNotMatch(app, /DIPPER_API_BASE_URL/);
  assert.doesNotMatch(app, /API_BASE_URL/);
  assert.doesNotMatch(html, /DIPPER_API_BASE_URL/);

  assert.match(api, /url\.pathname === '\/pair'/);
  assert.match(api, /tryServeStatic\(req, res, url\.pathname\)/);
  assert.match(index, /startApiServer\(\)/);
});
