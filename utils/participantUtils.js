/**
 * participantUtils.js — Utilitaires de comparaison de participants
 *
 * Extrait de handler.js pour casser la dépendance circulaire :
 * handler.js → commandLoader → kickall.js → handler.js (partiel = crash)
 *
 * Ce fichier est indépendant — aucune dépendance circulaire possible.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { jidDecode, jidEncode } = require('@whiskeysockets/baileys');

// ── Cache mapping LID ──────────────────────────────────────────────────────
const lidMappingCache = new Map();
const LID_CACHE_NULL  = Symbol('NULL');
const LID_CACHE_MAX   = 500;

function getLidMappingValue(user, direction) {
  if (!user) return null;
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) {
    const v = lidMappingCache.get(cacheKey);
    return v === LID_CACHE_NULL ? null : v;
  }
  try {
    const config      = require('../config');
    const sessionPath = path.join(__dirname, '..', config.sessionName || 'session');
    const suffix      = direction === 'pnToLid' ? '.json' : '_reverse.json';
    if (lidMappingCache.size >= LID_CACHE_MAX) {
      lidMappingCache.delete(lidMappingCache.keys().next().value);
    }
    const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
    if (!fs.existsSync(filePath)) {
      lidMappingCache.set(cacheKey, LID_CACHE_NULL);
      return null;
    }
    const raw   = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(cacheKey, value || LID_CACHE_NULL);
    return value || null;
  } catch {
    lidMappingCache.set(cacheKey, LID_CACHE_NULL);
    return null;
  }
}

// ── buildComparableIds — copie exacte de handler.js ───────────────────────
function buildComparableIds(jid) {
  if (!jid) return [];
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      const norm = normalizeJid(jid);
      return norm ? [norm] : [];
    }
    const variants   = new Set();
    const normServer = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    variants.add(jidEncode(decoded.user, normServer));
    if (['s.whatsapp.net', 'hosted'].includes(normServer)) {
      const lidUser = getLidMappingValue(decoded.user, 'pnToLid');
      if (lidUser) variants.add(jidEncode(lidUser, normServer === 'hosted' ? 'hosted.lid' : 'lid'));
    } else if (['lid', 'hosted.lid'].includes(normServer)) {
      const pnUser = getLidMappingValue(decoded.user, 'lidToPn');
      if (pnUser) variants.add(jidEncode(pnUser, normServer === 'hosted.lid' ? 'hosted' : 's.whatsapp.net'));
    }
    return Array.from(variants);
  } catch { return [jid]; }
}

function normalizeJid(jid) {
  if (!jid) return jid;
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) return `${jid.split(':')[0].split('@')[0]}@s.whatsapp.net`;
    let user   = decoded.user;
    let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    if (['lid', 'hosted.lid', 's.whatsapp.net', 'hosted'].includes(server)) {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) { user = pnUser; server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net'; }
    }
    return jidEncode(user, server === 'hosted' ? 'hosted' : 's.whatsapp.net');
  } catch { return jid; }
}

// ── findParticipant — copie exacte de handler.js ──────────────────────────
// Gère LID↔PN correctement. Cherche un participant par JID (ou liste de JIDs)
// dans une liste de participants Baileys.
function findParticipant(participants = [], userIds) {
  const targets = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .flatMap(id => buildComparableIds(id));
  if (!targets.length) return null;
  return participants.find(p => {
    if (!p) return false;
    return [p.id, p.lid, p.userJid]
      .filter(Boolean)
      .flatMap(id => buildComparableIds(id))
      .some(id => targets.includes(id));
  }) ?? null;
}

// ── isParticipantAdmin — vérifie si un participant est admin ──────────────
function isParticipantAdmin(participant) {
  if (!participant) return false;
  const adm = participant.admin ?? participant.isAdmin ?? participant.isSuperAdmin;
  return adm === 'admin' || adm === 'superadmin' || adm === true;
}

module.exports = { buildComparableIds, findParticipant, isParticipantAdmin, normalizeJid };
