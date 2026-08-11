'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const pairingService = require('../utils/pairingService');
const sessionManager = require('../utils/sessionManager');
const mongoClient = require('../utils/mongoClient');
const fileAuthState = require('../utils/fileAuthState');
const sessionIndex = require('../utils/sessionIndex');

const original = {
  getDb: mongoClient.getDb,
  getSession: sessionManager.getSession,
  startSession: sessionManager.startSession,
  stopSession: sessionManager.stopSession,
  requestPairingCode: sessionManager.requestPairingCode,
  deleteSessionFiles: fileAuthState.deleteSessionFiles,
  setState: sessionIndex.setState,
};

function restore() {
  mongoClient.getDb = original.getDb;
  sessionManager.getSession = original.getSession;
  sessionManager.startSession = original.startSession;
  sessionManager.stopSession = original.stopSession;
  sessionManager.requestPairingCode = original.requestPairingCode;
  fileAuthState.deleteSessionFiles = original.deleteSessionFiles;
  sessionIndex.setState = original.setState;
}

test.afterEach(restore);

test('une session déjà réellement en ligne reste protégée contre le doublon', async () => {
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://test';
  sessionManager.getSession = () => ({ isOnline: true, isRegistered: true });

  await assert.rejects(
    () => pairingService.createPairingSession('22997000000'),
    (err) => err?.code === 'ALREADY_ACTIVE'
  );
});

test('des creds registered mais hors ligne sont réinitialisés puis un nouveau code est généré', async () => {
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://test';

  const db = {};
  let current = null;
  let starts = 0;
  let stopped = 0;
  let deleted = 0;
  let resetIndexed = 0;

  mongoClient.getDb = async () => db;
  sessionManager.getSession = () => current;
  sessionManager.startSession = async () => {
    starts++;
    current = starts === 1
      ? { isOnline: false, isRegistered: true }
      : { isOnline: false, isRegistered: false };
    return current;
  };
  sessionManager.stopSession = async () => { stopped++; current = null; return true; };
  fileAuthState.deleteSessionFiles = async () => { deleted++; };
  sessionIndex.setState = async (_id, state) => {
    if (state?.isRegistered === false && state?.isOnline === false) resetIndexed++;
  };
  sessionManager.requestPairingCode = async () => 'ABCD-1234';

  const result = await pairingService.createPairingSession('22997000001');

  assert.deepEqual(result, {
    sessionId: 'session_22997000001',
    pairingCode: 'ABCD-1234',
    reconnected: false,
  });
  assert.equal(starts, 2);
  assert.equal(stopped, 1);
  assert.equal(deleted, 1);
  assert.equal(resetIndexed, 1);
});
