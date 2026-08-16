'use strict';

const config = require('../../config');
const styleManager = require('../../utils/styleManager');
const { renderResponse, getProfile, separatorFor } = require('../../utils/responseStyle');

const prefix = config.prefix || '.';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${ms / 1000}s) — ${label}`)), ms)),
  ]);
}

function safeErrMsg(err) {
  if (!err) return 'Erreur inconnue';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function activeStyle() {
  return Number(styleManager.getStyle()) || 0;
}

function styled(type, title, body, details = '') {
  return renderResponse({ type, title, body, details, footer: true, style: activeStyle() });
}

function codeBody(code, cleanNumber) {
  const style = activeStyle();
  const profile = getProfile(style);
  return [
    `${profile.accent} *${code}*`,
    separatorFor(style),
    `📱 Numéro : +${cleanNumber}`,
    '',
    '1. Ouvre WhatsApp',
    '2. Paramètres → Appareils connectés',
    '3. Connecter avec un numéro',
    '4. Entre le code affiché ci-dessus',
    '',
    '⚠️ Le code expire après quelques minutes.',
  ].join('\n');
}

module.exports = {
  name: 'pair',
  aliases: ['paircode', 'connexion', 'connect', 'newsession', 'addsession'],
  category: '🛠️ Outils généraux',
  description: 'Crée une nouvelle session WhatsApp en self-service, avec présentation adaptée au style actif.',
  usage: `${prefix}pair +22912345678`,

  async execute(sock, msg, args, extra) {
    const raw = args[0];
    if (!raw) return extra.reply(styled('usage', 'PAIR', `Usage : ${prefix}pair +22912345678`));

    const cleanNumber = String(raw).replace(/\D/g, '');
    if (cleanNumber.length < 7) {
      return extra.reply(styled('error', 'PAIR', 'Numéro invalide.', `Exemple : ${prefix}pair +22912345678`));
    }

    if (!process.env.MONGODB_URI) return _pairLegacy(sock, msg, extra, cleanNumber);
    return _pairViaService(sock, msg, extra, cleanNumber);
  },
};

async function _pairLegacy(sock, msg, extra, cleanNumber) {
  if (typeof sock?.requestPairingCode !== 'function') {
    return extra.reply(styled('error', 'PAIR', 'Méthode de pairing indisponible : le socket n’est pas prêt.'));
  }

  await extra.reply(styled('wait', 'PAIR', `Génération du code pour +${cleanNumber}…`));

  let code;
  try {
    const raw = await withTimeout(sock.requestPairingCode(cleanNumber), 20000, 'requestPairingCode');
    code = raw?.match(/.{1,4}/g)?.join('-') || raw || '????-????';
  } catch (err) {
    return extra.reply(styled('error', 'PAIR', safeErrMsg(err)));
  }

  return sock.sendMessage(
    extra.from,
    { text: styled('success', 'CODE DE CONNEXION', codeBody(code, cleanNumber)) },
    extra.from?.endsWith('@g.us') ? { quoted: msg } : undefined,
  );
}

async function _pairViaService(sock, msg, extra, cleanNumber) {
  const { createPairingSession, PairingError } = require('../../utils/pairingService');
  const sender = extra.sender;
  const from = extra.from;

  await extra.reply(styled('wait', 'PAIR', `Création de la session pour +${cleanNumber}…`));

  try {
    const { pairingCode, reconnected } = await createPairingSession(cleanNumber, {
      requesterKey: sender || from,
    });

    if (reconnected) {
      return extra.reply(styled(
        'success',
        'SESSION RECONNECTÉE',
        `📱 +${cleanNumber}\n\nCette session existait déjà. Les identifiants sauvegardés ont été réutilisés.`,
      ));
    }

    return extra.reply(styled('success', 'CODE DE CONNEXION', codeBody(pairingCode, cleanNumber)));
  } catch (err) {
    console.error('[pair multi]', err.message);

    if (err instanceof PairingError) {
      const messages = {
        NO_MONGODB: 'MongoDB non configuré.',
        DB_UNAVAILABLE: 'Connexion à la base de données impossible. Réessaie dans un instant.',
        INVALID_NUMBER: 'Numéro invalide.',
        COOLDOWN: err.message,
        ALREADY_ACTIVE: err.message,
        CODE_FAILED: `Échec de génération du code : ${err.message}`,
      };
      return extra.reply(styled(err.code === 'COOLDOWN' ? 'warning' : 'error', 'PAIR', messages[err.code] || err.message));
    }

    return extra.reply(styled('error', 'PAIR', safeErrMsg(err)));
  }
}
