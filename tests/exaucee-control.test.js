'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const originalCwd = process.cwd();
const { loadSettings, saveSettings, resetSettings } = require('../ai_chat/settings');

test('Exaucée settings persist on/off and modes per session', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exaucee-control-'));
  process.chdir(tmp);
  try {
    let settings = saveSettings('session-a', { enabled: false, onlyTag: true, ownerOnly: true });
    assert.equal(settings.enabled, false);
    assert.equal(settings.onlyTag, true);
    assert.equal(settings.ownerOnly, true);

    settings = loadSettings('session-a');
    assert.equal(settings.enabled, false);
    assert.equal(settings.onlyTag, true);
    assert.equal(settings.ownerOnly, true);

    const other = loadSettings('session-b');
    assert.equal(other.onlyTag, false);
    assert.equal(other.ownerOnly, false);

    const reset = resetSettings('session-a');
    assert.equal(reset.onlyTag, false);
    assert.equal(reset.ownerOnly, false);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
