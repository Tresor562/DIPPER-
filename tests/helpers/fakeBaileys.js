/**
 * Double de test pour @whiskeysockets/baileys — permet de tester
 * utils/sessionManager.js (createur de sockets réels normalement connectés
 * à WhatsApp) sans connexion réseau réelle, ce qui est de toute façon
 * impossible/indésirable en environnement de test automatisé (pas de vrai
 * compte WhatsApp à appairer en CI).
 *
 * Fournit :
 *   - useMultiFileAuthState(folder) : implémentation RÉELLE (lecture/
 *     écriture effective de creds.json sur disque), pour que
 *     utils/fileAuthState.js soit testé avec un vrai comportement fichier.
 *   - makeWASocket() : un faux socket avec un mini bus d'événements
 *     (.ev.on / ._trigger) permettant au test de simuler manuellement les
 *     événements 'connection.update' / 'messages.upsert' que le vrai
 *     Baileys émettrait après une connexion réseau réelle.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function initAuthCreds() {
  return { registered: false, me: null, noiseKey: {}, signedIdentityKey: {} };
}

async function useMultiFileAuthState(folder) {
  fs.mkdirSync(folder, { recursive: true });
  const credsPath = path.join(folder, 'creds.json');
  let creds;
  if (fs.existsSync(credsPath)) {
    creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  } else {
    creds = initAuthCreds();
  }
  const saveCreds = async () => {
    fs.writeFileSync(credsPath, JSON.stringify(creds));
  };
  const state = {
    creds,
    keys: { get: async () => ({}), set: async () => {} },
  };
  return { state, saveCreds };
}

/** Mini bus d'événements suffisant pour sock.ev.on(...) / déclenchement manuel côté test. */
class FakeEventBus {
  constructor() {
    this._handlers = new Map();
  }
  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, []);
    this._handlers.get(event).push(handler);
  }
  async _trigger(event, payload) {
    const handlers = this._handlers.get(event) || [];
    for (const h of handlers) await h(payload);
  }
}

function createFakeSocket() {
  const socket = {
    ev: new FakeEventBus(),
    user: { id: '22900000000:1@s.whatsapp.net' },
    sendPresenceUpdate: async () => {},
    sendMessage: async () => {},
    requestPairingCode: async () => '11112222',
  };
  return socket;
}

module.exports = {
  createBaileysDouble(recordedSockets) {
    return {
      default: (_opts) => {
        const sock = createFakeSocket();
        if (recordedSockets) recordedSockets.push(sock);
        return sock;
      },
      useMultiFileAuthState,
      initAuthCreds,
      BufferJSON: { replacer: undefined, reviver: undefined },
      proto: { Message: { fromObject: (o) => o, AppStateSyncKeyData: { fromObject: (o) => o } } },
      DisconnectReason: { loggedOut: 401 },
      Browsers: { ubuntu: () => ['Ubuntu', 'Chrome', '1.0'] },
      fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 0] }),
    };
  },

  /**
   * Installe le double dans le cache require AVANT que le module testé ne
   * require('@whiskeysockets/baileys'). Retourne la liste des sockets créés
   * (dans l'ordre) pour que le test puisse déclencher leurs événements, et
   * `restore()` pour retirer le double après le test.
   */
  installFakeBaileys() {
    const recordedSockets = [];
    const baileysPath = require.resolve('@whiskeysockets/baileys');
    const previous = require.cache[baileysPath];

    require.cache[baileysPath] = {
      id: baileysPath,
      filename: baileysPath,
      loaded: true,
      exports: module.exports.createBaileysDouble(recordedSockets),
    };

    return {
      recordedSockets,
      restore() {
        if (previous) require.cache[baileysPath] = previous;
        else delete require.cache[baileysPath];
      },
    };
  },
};
