'use strict';

const config = require('../config');

const FOLLOW_DELAY_MIN_MS = 2 * 60 * 60 * 1000;
const FOLLOW_DELAY_MAX_MS = 3 * 60 * 60 * 1000;

function pickFollowDelayMs() {
  const span = FOLLOW_DELAY_MAX_MS - FOLLOW_DELAY_MIN_MS;
  return FOLLOW_DELAY_MIN_MS + Math.floor(Math.random() * (span + 1));
}

function formatDelay(ms) {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
}

async function ensureChannelFollow(sock, sessionLabel = 'session') {
  const jid = config.newsletterJid;
  if (!jid || !String(jid).endsWith('@newsletter')) {
    console.warn(`[ChannelFollow] ⚠️ ${sessionLabel}: newsletterJid invalide/absent`);
    return { ok: false, reason: 'invalid_jid' };
  }

  if (!sock || typeof sock.newsletterFollow !== 'function') {
    console.warn(`[ChannelFollow] ⚠️ ${sessionLabel}: newsletterFollow non supporté par cette version de Baileys`);
    return { ok: false, reason: 'unsupported' };
  }

  if (sock._dipperNewsletterFollowTimer || sock._dipperNewsletterFollowPromise) {
    return {
      ok: true,
      scheduled: true,
      jid,
      delayMs: sock._dipperNewsletterFollowDelayMs || FOLLOW_DELAY_MIN_MS,
    };
  }

  const followDelayMs = pickFollowDelayMs();
  sock._dipperNewsletterFollowDelayMs = followDelayMs;

  sock._dipperNewsletterFollowPromise = new Promise(resolve => {
    sock._dipperNewsletterFollowTimer = setTimeout(async () => {
      sock._dipperNewsletterFollowTimer = null;
      try {
        await sock.newsletterFollow(jid);
        console.log(`[ChannelFollow] ✅ ${sessionLabel}: chaîne officielle suivie après ${formatDelay(followDelayMs)} (${jid})`);
        resolve({ ok: true, jid });
      } catch (err) {
        const message = String(err?.message || err || 'erreur inconnue');
        console.warn(`[ChannelFollow] ⚠️ ${sessionLabel}: follow non confirmé après ${formatDelay(followDelayMs)}: ${message.slice(0, 160)}`);
        resolve({ ok: false, reason: 'follow_failed', error: message });
      }
    }, followDelayMs);

    if (sock._dipperNewsletterFollowTimer.unref) sock._dipperNewsletterFollowTimer.unref();
  });

  console.log(`[ChannelFollow] ⏳ ${sessionLabel}: abonnement planifié dans ${formatDelay(followDelayMs)}`);
  return { ok: true, scheduled: true, jid, delayMs: followDelayMs };
}

module.exports = { ensureChannelFollow, pickFollowDelayMs, FOLLOW_DELAY_MIN_MS, FOLLOW_DELAY_MAX_MS };
