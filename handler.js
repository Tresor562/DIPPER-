/**
 * 𝐃𝐈𝐏𝐏𝐄𝐑 Handler — Version 4.0 SUPREME FORGE
 *
 * ╔══════════════════════════════════════════════════════╗
 * ║  CORRECTIONS v4.0 vs v3.5                           ║
 * ║                                                      ║
 * ║  [FIX 1] selfMode : owner + supremeOwners passent   ║
 * ║           partout (groupes ET privé)                 ║
 * ║  [FIX 2] NLE (ghostgMode) : bloqué aux non-owners   ║
 * ║           Seuls isMe + isSuperMe y ont accès         ║
 * ║  [FIX 3] antidelete : détection protocolMessage     ║
 * ║           type 0 ET type 5 (REVOKE)                 ║
 * ║  [FIX 4] cacheForAntidelete : capture aussi les     ║
 * ║           messages view-once + éphémères             ║
 * ║  [FIX 5] isMutedContext : owners/supremes passent   ║
 * ║           même si le contexte est muté              ║
 * ║  [FIX 6] ban check : ajout vérif isSuperMe avant   ║
 * ║           tout filtre pour éviter auto-ban owner    ║
 * ║  [FIX 7] buildExtra : isSuperMe correctement       ║
 * ║           propagé dans toutes les commandes         ║
 * ║  [FIX 8] handleAntilink : pattern URL renforcé     ║
 * ║           (whatsapp.com/channel, t.me inclus)      ║
 * ║  [FIX 9] NLP : args mal splittés → fixed           ║
 * ║  [FIX 10] groupOnly guard : message explicite       ║
 * ║            + pas de crash si !groupMetadata         ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Hiérarchie :
 *   Niveau 0 : SUPREME OWNERS  — bypass absolu, réaction 👑
 *   Niveau 1 : ENV OWNER       — bypass selfMode + toutes cmds
 *   Niveau 2 : SUDO USERS      — bypass selfMode, SAUF souveraineté
 *   Niveau 3 : MODERATORS      — commandes modOnly
 *   Niveau 4 : USERS           — selon selfMode
 */

const config   = require('./config');
const database = require('./database');
const sessionContext = require('./utils/sessionContext');
const { loadCommands }         = require('./utils/commandLoader');
const { addMessage }           = require('./utils/groupstats');
const { isAllowedUser }        = require('./utils/jidHelpers');
// [FIX] Import de trackMemberActivity depuis mentstats
// Chargement différé (lazy) pour éviter les circular deps au boot
let trackMemberActivity = null;
try {
  const mentstats = require('./commands/group_management/mentstats');
  trackMemberActivity = mentstats.trackMemberActivity || null;
} catch (_) {
  // Si le module n'existe pas encore, on ignore silencieusement
  trackMemberActivity = null;
}
const styleManager             = require('./utils/styleManager');
const { jidDecode, jidEncode, downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs   = require('fs');
const path = require('path');
const axios = require('axios');

// ==========================================
// [FIX CRITIQUE] getProtHandlers — chargement
// différé des handlers de protection avancés
// (antibadword, antibot, antiforeign, etc.)
// Ces handlers sont dans commands/group_management/protections.js
// ==========================================
let _protHandlersCache = null;
const getProtHandlers = () => {
  if (_protHandlersCache) return _protHandlersCache;
  try {
    _protHandlersCache = require('./commands/group_management/protections');
  } catch (e) {
    // Le fichier n'existe pas encore ou erreur de chargement
    // On retourne un objet vide pour éviter tout crash
    console.warn('[getProtHandlers] Impossible de charger protections.js :', e.message);
    _protHandlersCache = {};
  }
  return _protHandlersCache;
};

// ==========================================
// SUPREME OWNER LIDs (identifiants internes WA)
// ==========================================
const SUPREME_OWNER_LIDS = [
  '188055763857491@lid',
  '274053894017167@lid',
];

// ==========================================
// CATEGORY BLOQUÉE POUR SUDO
// ==========================================
const SUDO_BLOCKED_CATEGORY = '♛ sᴏᴜᴠᴇʀᴀɪɴᴇᴛᴇ́';

// ==========================================
// UNMUTE ALIASES
// ==========================================
const UNMUTE_ALIASES = new Set(['muteDark', 'muteghost', 'mutebot', 'veille', 'silence']);

const isUnmuteCommand = (body, prefix) => {
  if (!body) return false;
  const trimmed = body.trim();
  if (!trimmed.startsWith(prefix)) return false;
  const parts = trimmed.slice(prefix.length).trim().toLowerCase().split(/\s+/);
  return UNMUTE_ALIASES.has(parts[0]) && parts[1] === 'off';
};

// ==========================================
// BAN CHECK
// [FIX 6] : vérifié seulement APRÈS la vérif owner
// ==========================================
const isBannedUser = (sender) => {
  if (!sender) return false;
  try {
    const bannedRaw = process.env.BANNED_USERS || '';
    if (!bannedRaw.trim()) return false;
    const bannedList = bannedRaw.split(',').map(n => n.trim()).filter(Boolean);
    const senderNum  = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
    return bannedList.includes(senderNum);
  } catch { return false; }
};

// ==========================================
// MUTE CHECK
// [FIX 5] : owners et supremeOwners ne sont jamais
//           bloqués par le mute — même en groupe muté
// ==========================================
const isMutedContext = (chatId) => {
  try {
    const isGroup  = chatId?.endsWith('@g.us');
    const settings = isGroup
      ? database.getGroupSettings(chatId)
      : database.getUserSettings?.(chatId) || {};
    if (!settings?.isMuted) return false;
    const muteUntil = settings.muteUntil || 0;
    if (muteUntil === 0) return true;
    if (Date.now() < muteUntil) return true;
    if (isGroup) database.updateGroupSettings(chatId, { isMuted: false, muteUntil: 0 });
    else         database.updateUser?.(chatId, { isMuted: false, muteUntil: 0 });
    return false;
  } catch { return false; }
};

// ==========================================
// ANTIDELETE CACHE
// [FIX 4] : capture éphémères + view-once + documents
// ==========================================
const antideleteCache = new Map();
const ANTIDELETE_TTL  = 10 * 60 * 1000;

function cacheForAntidelete(msg) {
  if (!msg?.key?.id) return;
  if (msg.key.fromMe)  return;

  // Déplie les wrappers pour accéder au vrai contenu
  let m = msg.message;
  if (!m) return;

  if (m.ephemeralMessage)           m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2)          m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage)            m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

  // Ne cache pas les protocolMessages (suppressions, réactions...)
  if (m?.protocolMessage) return;
  if (m?.reactionMessage) return;

  // Crée un msg enrichi avec le contenu dénormalisé
  const enriched = { ...msg, _unwrappedMessage: m };
  // [FIX PERF] Pas de setTimeout par message — le timer périodique ci-dessous purge le cache
  antideleteCache.set(sessionContext.scopeKey(msg.key.id), { msg: enriched, cachedAt: Date.now() });
}

// ==========================================
// UTILITAIRES MESSAGES
// ==========================================
const getMessageBody = (message) => {
  if (!message) return null;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    null
  );
};

const getMediaType = (message) => {
  if (!message) return null;
  if (message.imageMessage)                                    return 'image';
  if (message.videoMessage)                                    return 'video';
  if (message.audioMessage || message.voiceMessage)           return 'audio';
  if (message.stickerMessage)                                  return 'sticker';
  if (message.documentMessage)                                 return 'document';
  return null;
};

// ==========================================
// SMALL CAPS
// ==========================================
const toSmallCaps = (text) => {
  if (!text) return '';
  const normal    = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  return String(text).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split('').map(c => { const i = normal.indexOf(c); return i !== -1 ? smallCaps[i] : c; }).join('');
};

// ==========================================
// CACHE METADATA GROUPE
// [FIX 6] Nettoyage périodique — sans ça, les groupes inactifs
// restent en mémoire indéfiniment → fuite mémoire progressive.
// ==========================================
const groupMetadataCache = new Map();
const CACHE_TTL          = 300000; // [PERF] 5 min — reduit les requetes reseau vers WhatsApp

// [PERF] Purge unifiée de tous les caches toutes les 5 minutes
// — evite les fuites mémoire progressives sur longue durée
const _gcPurgeTimer = setInterval(() => {
  const now = Date.now();
  // Purge groupMetadataCache (entrees > 10 min)
  for (const [key, entry] of groupMetadataCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL * 10) groupMetadataCache.delete(key);
  }
  // Purge antideleteCache (entrees > TTL)
  for (const [key, entry] of antideleteCache.entries()) {
    if (now - entry.cachedAt > ANTIDELETE_TTL) antideleteCache.delete(key);
  }
  // Purge lidMappingCache si trop grande (evite croissance infinie)
  if (lidMappingCache.size > LID_CACHE_MAX) {
    const toDelete = lidMappingCache.size - Math.floor(LID_CACHE_MAX * 0.8);
    let deleted = 0;
    for (const key of lidMappingCache.keys()) {
      if (deleted >= toDelete) break;
      lidMappingCache.delete(key);
      deleted++;
    }
  }
  // Purge cache arCfg si trop vieux (force relecture apres 5 min) — par session
  const arCfgCutoff = Date.now() - 5 * 60 * 1000;
  for (const [sid, entry] of _arCfgCacheBySession) {
    if (entry.ts < arCfgCutoff) _arCfgCacheBySession.delete(sid);
  }
}, 5 * 60 * 1000);
if (_gcPurgeTimer.unref) _gcPurgeTimer.unref();

const commands = loadCommands();

// [PERF] Cache global des modules critiques appelés sur chaque message
// Évite les require() lazy répétés à chaque message de groupe
global._antispamMod     = commands.get('antispam')     || null;
global._purificationMod = commands.get('purification') || null;
global.commands = commands;

// ==========================================
// NORMALISATION DES MESSAGES
// ==========================================
const getMessageContent = (msg) => {
  if (!msg?.message) return null;
  let m = msg.message;
  if (m.ephemeralMessage)           m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2)          m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage)            m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  return m;
};

// ==========================================
// CACHE GROUPE — AVEC FALLBACK SUR STALE + TIMEOUT
// [FIX STABILITÉ] Sans timeout, sock.groupMetadata() peut bloquer
// pendant 10-30s sur rate-limit ou réseau lent → event loop saturée
// → le bot ne répond plus. On ajoute un timeout de 5s : si WA ne
// répond pas, on retourne le cache même s'il est périmé (stale).
// ==========================================
const getCachedGroupMetadata = async (sock, groupId) => {
  try {
    if (!groupId?.endsWith('@g.us')) return null;
    const cached = groupMetadataCache.get(sessionContext.scopeKey(groupId));
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

    // [FIX] Timeout 5s : si WA met plus de 5s à répondre, on utilise
    // le cache périmé plutôt que de bloquer l'event loop.
    const metadata = await Promise.race([
      sock.groupMetadata(groupId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('groupMetadata_timeout')), 5000)),
    ]);
    groupMetadataCache.set(sessionContext.scopeKey(groupId), { data: metadata, timestamp: Date.now() });
    return metadata;
  } catch (error) {
    const cached = groupMetadataCache.get(sessionContext.scopeKey(groupId));
    if (error.message !== 'groupMetadata_timeout') {
      // Erreur réseau réelle — log discret
      if (!error.message?.includes('rate-overlimit')) {
        // Silencieux — le cache stale sera retourné
      }
    }
    if (
      error.message?.includes('rate-overlimit') ||
      error.message?.includes('403') ||
      error.statusCode === 403 ||
      error.output?.statusCode === 403 ||
      error.data === 403
    ) {
      if (!cached) groupMetadataCache.set(sessionContext.scopeKey(groupId), { data: null, timestamp: Date.now() });
    }
    return cached?.data ?? null;
  }
};

const getLiveGroupMetadata = async (sock, groupId) => {
  try {
    const metadata = await sock.groupMetadata(groupId);
    groupMetadataCache.set(sessionContext.scopeKey(groupId), { data: metadata, timestamp: Date.now() });
    return metadata;
  } catch (error) {
    return groupMetadataCache.get(sessionContext.scopeKey(groupId))?.data ?? null;
  }
};

// [FIX RACINE] getGroupMetadata utilisé partout dans le handler pour isAdmin,
// isBotAdmin, buildExtra. Doit TOUJOURS retourner des données fraîches.
// L'ancienne version pointait vers getCachedGroupMetadata (TTL 5 min) ce qui
// causait le faux "bot pas admin" et les faux "not admin" pour les utilisateurs.
const getGroupMetadata = getLiveGroupMetadata;

// ══════════════════════════════════════════════════════════════
// CACHE AUTOREPLY CONFIG
// [PERF] Évite de lire autoreply_video.json sur CHAQUE message
// mentionnant le bot. Cache de 30 secondes en mémoire.
// ══════════════════════════════════════════════════════════════
// [PHASE 2] Isolation par session : avant, un seul cache (_arCfgCache/_arCfgTs)
// et un seul chemin process.cwd()/data/autoreply_video.json pour TOUTES les
// sessions. reply.js (Phase 2) écrit maintenant sa config dans
// database/sessions/<sessionId>/autoreply_video.json — ce cache doit lire
// exactement le même emplacement, par session, sinon la fonctionnalité
// .reply cesse simplement de fonctionner en multi-session.
const _arCfgCacheBySession = new Map(); // sessionId -> { cache, ts }
const AR_CFG_TTL = 30000; // 30 secondes

function getArCfgCached() {
  const sid = sessionContext.getCurrentSessionId();
  const now = Date.now();
  const entry = _arCfgCacheBySession.get(sid);
  if (entry && (now - entry.ts) < AR_CFG_TTL) return entry.cache;

  let cache = null;
  try {
    const metaP = path.join(process.cwd(), 'database', 'sessions', sid, 'autoreply_video.json');
    if (fs.existsSync(metaP)) {
      const raw = fs.readFileSync(metaP, 'utf8').trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        cache = parsed?.active ? parsed : null;
      }
    }
  } catch {
    cache = null;
  }
  _arCfgCacheBySession.set(sid, { cache, ts: now });
  return cache;
}

// Invalider le cache quand .reply est exécuté (session courante uniquement)
function invalidateArCfgCache() { _arCfgCacheBySession.delete(sessionContext.getCurrentSessionId()); }

// [FIX KICKALL] Permet aux commandes d'invalider le cache metadata d'un groupe
// après une opération massive (kickall, etc.) pour éviter les états périmés.
function invalidateGroupMetadataCache(groupId) {
  if (groupId) {
    groupMetadataCache.delete(groupId);
  } else {
    groupMetadataCache.clear();
  }
}


// ==========================================
// LID MAPPING
// [FIX 7] Limite de taille ajoutée — sans limite, chaque JID
// unique consulté ajoute une entrée permanente → fuite mémoire.
// ==========================================
const LID_CACHE_MAX = 2000; // [PERF] Augmenté pour réduire les lectures disque
const LID_CACHE_NULL = Symbol('null'); // Sentinel pour "fichier inexistant" - évite existsSync répété
const lidMappingCache = new Map();

const normalizeJid = (jid) => {
  if (!jid || typeof jid !== 'string') return null;
  if (jid.includes(':')) return jid.split(':')[0];
  if (jid.includes('@')) return jid.split('@')[0];
  return jid;
};

const getLidMappingValue = (user, direction) => {
  if (!user) return null;
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) {
    const v = lidMappingCache.get(cacheKey);
    return v === LID_CACHE_NULL ? null : v; // [PERF] Sentinel → null sans FS
  }
  const sessionPath = path.join(__dirname, config.sessionName || 'session');
  const suffix      = direction === 'pnToLid' ? '.json' : '_reverse.json';
  // [PERF] Limite de taille : supprimer la plus ancienne entrée si nécessaire
  if (lidMappingCache.size >= LID_CACHE_MAX) {
    lidMappingCache.delete(lidMappingCache.keys().next().value);
  }
  const filePath    = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
  if (!fs.existsSync(filePath)) { lidMappingCache.set(cacheKey, LID_CACHE_NULL); return null; } // Sentinel
  try {
    const raw   = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(cacheKey, value || null);
    return value || null;
  } catch { lidMappingCache.set(cacheKey, null); return null; }
};

const normalizeJidWithLid = (jid) => {
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
};

const buildComparableIds = (jid) => {
  if (!jid) return [];
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) return [normalizeJidWithLid(jid)].filter(Boolean);
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
};

const findParticipant = (participants = [], userIds) => {
  const targets = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean).flatMap(id => buildComparableIds(id));
  if (!targets.length) return null;
  return participants.find(p => {
    if (!p) return false;
    return [p.id, p.lid, p.userJid].filter(Boolean)
      .flatMap(id => buildComparableIds(id))
      .some(id => targets.includes(id));
  }) ?? null;
};

// ==========================================
// CHECKS ADMIN
// ==========================================
const isAdmin = async (sock, participant, groupId, groupMetadata = null) => {
  if (!participant || !groupId?.endsWith('@g.us')) return false;
  try {
    const meta = groupMetadata?.participants ? groupMetadata : await getLiveGroupMetadata(sock, groupId);
    if (!meta?.participants) return false;
    const found  = findParticipant(meta.participants, participant);
    if (!found) return false;
    const status = found.admin || found.isAdmin || found.isSuperAdmin;
    return status === 'admin' || status === 'superadmin' || status === true;
  } catch { return false; }
};

const isBotAdmin = async (sock, groupId) => {
  if (!sock.user || !groupId?.endsWith('@g.us')) return false;
  try {
    const rawIds = [sock.user.id, sock.user.lid].filter(Boolean);
    const botNums = [...new Set(rawIds.map(j => j.split(':')[0].split('@')[0]).filter(Boolean))];

    // [FIX RACINE] Toujours fetch live — le cache 5 min cause le faux "bot pas admin"
    // On tente le live d'abord, on tombe sur le cache uniquement si le réseau timeout
    let meta;
    try {
      meta = await Promise.race([
        sock.groupMetadata(groupId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_botadmin')), 6000)),
      ]);
      // Mettre à jour le cache avec les données fraîches
      if (meta?.participants) {
        groupMetadataCache.set(sessionContext.scopeKey(groupId), { data: meta, timestamp: Date.now() });
      }
    } catch {
      // Fallback sur le cache uniquement si le réseau est indisponible
      meta = groupMetadataCache.get(sessionContext.scopeKey(groupId))?.data || null;
    }

    if (!meta?.participants) return false;

    // [FIX LID] Utiliser findParticipant() qui gère les LIDs via buildComparableIds().
    // L'ancienne logique pNum/pLid échoue quand p.id est en format '@lid'
    // (groupe WhatsApp récent) car le LID n'est pas le numéro de téléphone du bot.
    const botJidsForCheck = rawIds.flatMap(id => {
      const num = id.split(':')[0].split('@')[0];
      return [id, `${num}@s.whatsapp.net`, `${num}@c.us`];
    }).filter(Boolean);

    const botEntry = findParticipant(meta.participants, botJidsForCheck);
    if (!botEntry) {
      console.log(`[isBotAdmin] Bot non trouvé dans participants — botJids: ${botJidsForCheck.join(', ')}`);
      console.log(`[isBotAdmin] Participants ids: ${meta.participants.map(p => p.id).join(', ')}`);
      return false;
    }
    const adm = botEntry.admin ?? botEntry.isAdmin ?? botEntry.isSuperAdmin;
    const result = adm === 'admin' || adm === 'superadmin' || adm === true;
    console.log(`[isBotAdmin] Bot trouvé: ${botEntry.id} | admin=${botEntry.admin} | result=${result}`);
    return result;
  } catch { return false; }
};

// ==========================================
// HIÉRARCHIE PROPRIÉTAIRES
// ==========================================
const isSupremeOwner = (sender) => {
  if (!sender) return false;
  if (SUPREME_OWNER_LIDS.includes(sender)) return true;
  const senderNumber   = normalizeJid(normalizeJidWithLid(sender));
  const supremeNumbers = (config.supremeOwners || []).map(n => String(n).replace(/\D/g, ''));
  return supremeNumbers.includes(senderNumber);
};

const isOwner = (sender) => {
  if (!sender) return false;
  const senderNumber = normalizeJid(normalizeJidWithLid(sender));
  return (config.ownerNumber || []).some(owner => {
    const normalized = normalizeJidWithLid(owner.includes('@') ? owner : `${owner}@s.whatsapp.net`);
    return normalizeJid(normalized) === senderNumber;
  });
};

const isAnyOwner  = (sender) => isSupremeOwner(sender) || isOwner(sender);
const isMod       = (sender) => database.isModerator(sender.split('@')[0]);
const isSystemJid = (jid)    =>
  !jid ||
  jid.includes('@broadcast') ||
  jid.includes('status.broadcast') ||
  jid.includes('@newsletter');

// ==========================================
// SUDO — Niveau 2
// ==========================================
const isSudoUser = (sender) => {
  if (!sender) return false;
  try {
    const senderNum = sender.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (database.getSudoUser) {
      const u = database.getSudoUser(senderNum);
      return u?.isSudo === true;
    }
    if (database.getUser) {
      const u = database.getUser(sender);
      return u?.isSudo === true;
    }
    return false;
  } catch { return false; }
};

// ==========================================
// buildExtra — [FIX 7] isSuperMe bien propagé
// ==========================================
const buildExtra = async (sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo = false, _cachedIsAdmin = null) => ({
  from, sender, isGroup, groupMetadata,
  isOwner:        isMe,
  isSupremeOwner: isSuperMe,
  isSudo,
  // [PERF] Utilise le résultat pré-calculé si disponible, sinon calcule (appels depuis commandes)
  isAdmin:        _cachedIsAdmin !== null ? _cachedIsAdmin : (isGroup ? await isAdmin(sock, sender, from, groupMetadata) : false),
  isBotAdmin:     botIsAdmin,
  isMod:          isMod(sender),
  toSmallCaps,
  // ── Phrases adaptées au style actif du menu ──────────────────
  style:   styleManager.getStyle(),
  phrases: styleManager.getPhrases(),
  // ── reply() robuste — corrigé pour les conversations privées ──
  //
  // CAUSE DU BUG PRIVÉ identifiée :
  //
  // En Baileys v6, sendMessage(jid, {text}, {quoted: msg}) en privé
  // peut échouer silencieusement si msg.key.participant est undefined
  // (ce champ n'existe pas dans les messages privés, uniquement en groupe).
  // Baileys construit alors un quoted message malformé que WhatsApp accepte
  // côté serveur (pas d'erreur retournée) mais n'affiche JAMAIS côté client.
  // logOutgoing() est appelé avant _orig() donc le log console apparaît
  // même quand WhatsApp ne délivre rien.
  //
  // SOLUTION : en privé (JID ne finit pas par @g.us), envoyer SANS quoted.
  // Les messages privés n'ont pas besoin de quoted pour être clairs.
  // En groupe, garder le quoted pour le contexte.
  reply: async (text) => {
    const _isPrivate = !from.endsWith('@g.us');
    const _from      = from;

    console.log(`[reply] → jid:${_from} privé:${_isPrivate} longueur:${String(text).length}`);

    if (_isPrivate) {
      // ── PRIVÉ : jamais de quoted (cause du bug silencieux) ──────────
      try {
        const result = await sock.sendMessage(_from, { text });
        console.log(`[reply] ✅ Envoi privé OK — id:${result?.key?.id}`);
        return result;
      } catch (err) {
        console.error(`[reply] ❌ Envoi privé ÉCHOUÉ — jid:${_from} erreur:${err.message}`);
        throw err;
      }
    } else {
      // ── GROUPE : avec quoted d'abord, sans quoted en fallback ────────
      try {
        const result = await sock.sendMessage(_from, { text }, { quoted: msg });
        return result;
      } catch (err1) {
        console.warn(`[reply] ⚠️ Envoi groupe avec quoted échoué (${_from}) : ${err1.message}`);
        try {
          const result = await sock.sendMessage(_from, { text });
          console.log(`[reply] ✅ Envoi groupe sans quoted réussi (${_from})`);
          return result;
        } catch (err2) {
          console.error(`[reply] ❌ Envoi groupe sans quoted aussi échoué (${_from}) : ${err2.message}`);
          throw err2;
        }
      }
    }
  },
  react:  (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } }).catch(e => {
    console.warn(`[react] ⚠️ Réaction échouée (${from}) : ${e.message}`);
  })
});

// ==========================================
// INTERCEPTEUR ANTIDELETE
// [FIX 3] : type 0 (REVOKE normal) + type 5 (EPHEMERAL_SETTING)
//            + key manquante ou distante gérée proprement
// ==========================================
const handleDeletedMessage = async (sock, deletedMsgId, chatId, revokedBy) => {
  try {
    const cached = antideleteCache.get(sessionContext.scopeKey(deletedMsgId));
    if (!cached) return;

    const { msg }   = cached;
    const isGroup   = chatId?.endsWith('@g.us');
    const settings  = isGroup
      ? database.getGroupSettings(chatId)
      : database.getUserSettings?.(chatId) || {};
    if (!settings?.antidelete) return;

    const mode          = settings.antideleteMode || 'private';
    // [FIX 4] : utilise le message dénormalisé si disponible
    const originalMsg   = msg._unwrappedMessage || msg.message;
    const senderJid     = msg.key.participant || msg.key.remoteJid;
    const senderNumber  = senderJid?.split('@')[0]?.split(':')[0] || '?';
    const revokedNumber = revokedBy?.split('@')[0]?.split(':')[0] || senderNumber;
    const msgDate       = msg.messageTimestamp
      ? new Date(msg.messageTimestamp * 1000).toLocaleTimeString('fr-FR', {
          timeZone: 'Africa/Ouagadougou', hour: '2-digit', minute: '2-digit'
        })
      : '—';

    let destination;
    if (mode === 'private') {
      const ownerNum = config.ownerNumber?.[0];
      destination    = ownerNum ? String(ownerNum).replace(/\D/g, '') + '@s.whatsapp.net' : null;
      if (!destination) return;
    } else {
      destination = chatId;
    }

    const body      = getMessageBody(originalMsg);
    const mediaType = getMediaType(originalMsg);
    const mentions  = [senderJid, revokedBy].filter(Boolean);

    const headerText =
      `╭━≪• *👁️ 𝐃𝐈𝐏𝐏𝐄𝐑  ᴀɴᴛɪᴅᴇʟᴇᴛᴇ* •≫━╾╮\n┃\n` +
      `┃ 🗑️ *${toSmallCaps('message supprime')}*\n┃\n` +
      `┃ 👤 *${toSmallCaps('auteur')}* : @${senderNumber}\n` +
      `┃ ✂️ *${toSmallCaps('supprime par')}* : @${revokedNumber}\n` +
      `┃ ⏰ *${toSmallCaps('heure')}* : ${msgDate}\n` +
      `┃ 📍 *${toSmallCaps('lieu')}* : ${isGroup ? toSmallCaps('groupe') : toSmallCaps('prive')}\n` +
      (mode === 'private' && isGroup ? `┃ 🔗 *${toSmallCaps('chat')}* : ${chatId}\n` : '') +
      `┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯\n`;

    if (!mediaType) {
      await sock.sendMessage(destination, {
        text: headerText + `\n*💬 ${toSmallCaps('contenu')} :*\n${body || toSmallCaps('contenu non disponible')}`,
        mentions
      });
    } else {
      try {
        const mediaBuffer = await downloadMediaMessage(
          msg, 'buffer', {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
        if (mediaBuffer && mediaBuffer.length > 0) {
          const p = { mentions };
          if (mediaType === 'image') {
            p.image   = mediaBuffer;
            p.caption = headerText + (body ? `\n*💬 ${toSmallCaps('legende')} :*\n${body}` : '');
          } else if (mediaType === 'video') {
            p.video   = mediaBuffer;
            p.caption = headerText + (body ? `\n*💬 ${toSmallCaps('legende')} :*\n${body}` : '');
          } else if (mediaType === 'audio') {
            await sock.sendMessage(destination, { text: headerText, mentions });
            p.audio    = mediaBuffer;
            p.mimetype = originalMsg.audioMessage?.mimetype || originalMsg.voiceMessage?.mimetype || 'audio/ogg; codecs=opus';
            p.ptt      = !!(originalMsg.audioMessage?.ptt || originalMsg.voiceMessage);
          } else if (mediaType === 'sticker') {
            await sock.sendMessage(destination, { text: headerText, mentions });
            p.sticker = mediaBuffer;
          } else if (mediaType === 'document') {
            p.document = mediaBuffer;
            p.mimetype = originalMsg.documentMessage?.mimetype || 'application/octet-stream';
            p.fileName = originalMsg.documentMessage?.fileName || 'fichier';
            p.caption  = headerText + (body ? `\n*💬 ${toSmallCaps('legende')} :*\n${body}` : '');
          }
          await sock.sendMessage(destination, p);
        } else {
          await sock.sendMessage(destination, {
            text: headerText + `\n*📎 ${toSmallCaps('media')} : ${mediaType}*\n_${toSmallCaps('media non recuperable')}_`,
            mentions
          });
        }
      } catch (_) {
        await sock.sendMessage(destination, {
          text: headerText + `\n*📎 ${toSmallCaps('media')} : ${mediaType}*\n_${toSmallCaps('media expire')}_`,
          mentions
        });
      }
    }
    antideleteCache.delete(sessionContext.scopeKey(deletedMsgId));
  } catch (error) {
    if (!error.message?.includes('rate-overlimit')) console.error('[antidelete]', error.message);
  }
};


// ==========================================
// CONSOLE LOGGING — MESSAGES IN/OUT
// ==========================================

// Couleurs ANSI
const C = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  magenta:'\x1b[35m',
  blue:   '\x1b[34m',
  gray:   '\x1b[90m',
};

function fmtTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtJid(jid = '') {
  if (!jid) return '?';
  if (jid.endsWith('@g.us')) {
    const num = jid.replace('@g.us', '');
    return `${C.magenta}[groupe:${num.slice(-6)}]${C.reset}`;
  }
  const num = jid.split('@')[0].split(':')[0];
  return `${C.cyan}+${num}${C.reset}`;
}

function fmtBody(content, msg) {
  if (!content) {
    const m = msg && msg.message ? msg.message : {};
    const unwrapped = m.ephemeralMessage && m.ephemeralMessage.message
      ? m.ephemeralMessage.message
      : m.viewOnceMessageV2 && m.viewOnceMessageV2.message
        ? m.viewOnceMessageV2.message
        : m.viewOnceMessage && m.viewOnceMessage.message
          ? m.viewOnceMessage.message
          : m;
    if (unwrapped.imageMessage)    return C.yellow + '[image]' + C.reset + (unwrapped.imageMessage.caption ? ' ' + unwrapped.imageMessage.caption : '');
    if (unwrapped.videoMessage)    return C.yellow + '[video]' + C.reset + (unwrapped.videoMessage.caption ? ' ' + unwrapped.videoMessage.caption : '');
    if (unwrapped.audioMessage)    return C.yellow + '[audio]' + C.reset;
    if (unwrapped.voiceMessage)    return C.yellow + '[vocal]' + C.reset;
    if (unwrapped.stickerMessage)  return C.yellow + '[sticker]' + C.reset;
    if (unwrapped.documentMessage) return C.yellow + '[document]' + C.reset + (unwrapped.documentMessage.fileName ? ' ' + unwrapped.documentMessage.fileName : '');
    if (unwrapped.reactionMessage) return C.yellow + '[réaction: ' + (unwrapped.reactionMessage.text || '?') + ']' + C.reset;
    if (unwrapped.contactMessage)  return C.yellow + '[contact]' + C.reset;
    if (unwrapped.locationMessage) return C.yellow + '[localisation]' + C.reset;
    return C.gray + '[?]' + C.reset;
  }
  const max = 120;
  const clean = String(content).replace(/\n/g, ' ');
  return clean.length > max ? clean.slice(0, max) + '\u2026' : clean;
}

function logIncoming(msg) {
  try {
    const from    = (msg.key && msg.key.remoteJid) || '?';
    const sender  = (msg.key && (msg.key.participant || msg.key.remoteJid)) || '?';
    const name    = msg.pushName || '';
    const content = getMessageBody(getMessageContent(msg));
    const preview = fmtBody(content, msg);
    const namePart = name ? (C.bold + name + C.reset + ' ' + C.dim + '(' + fmtJid(sender) + ')' + C.reset) : fmtJid(sender);
    const dest    = from.endsWith('@g.us') ? (' \u2192 ' + fmtJid(from)) : '';
    console.log(C.gray + '[' + fmtTime() + ']' + C.reset + ' ' + C.green + '\u25c4 IN ' + C.reset + ' ' + namePart + dest + '  ' + preview);
  } catch (_) {}
}

function logOutgoing(jid, payload) {
  try {
    const dest = fmtJid(jid);
    let preview = '';
    if (payload.text)     preview = fmtBody(payload.text, null);
    else if (payload.image)    preview = C.yellow + '[image]' + C.reset + (payload.caption ? ' ' + payload.caption : '');
    else if (payload.video)    preview = C.yellow + '[video]' + C.reset + (payload.caption ? ' ' + payload.caption : '');
    else if (payload.audio)    preview = C.yellow + '[audio]' + C.reset;
    else if (payload.sticker)  preview = C.yellow + '[sticker]' + C.reset;
    else if (payload.document) preview = C.yellow + '[document: ' + (payload.fileName || '') + ']' + C.reset;
    else if (payload.react)    preview = C.yellow + '[réaction: ' + ((payload.react && payload.react.text) || '?') + ']' + C.reset;
    else if (payload.delete)   preview = C.yellow + '[suppression]' + C.reset;
    else                       preview = C.gray + '[?]' + C.reset;
    console.log(C.gray + '[' + fmtTime() + ']' + C.reset + ' ' + C.blue + '\u25ba OUT' + C.reset + ' \u2192 ' + dest + '  ' + preview);
  } catch (_) {}
}

// Cache des IDs des messages envoyés par le bot
// Utilisé par la détection 4 de l'autoReply pour identifier les réponses au bot
// même quand arCtx.participant est vide (cas LID/multi-device rare)
if (!global._botSentMessageIds) {
  global._botSentMessageIds = new Set();
}
const BOT_MSG_CACHE_MAX = 500; // max IDs à garder en mémoire

function wrapSendMessage(sock) {
  if (sock.__logWrapped) return;
  sock.__logWrapped = true;
  const _orig = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, payload, opts) => {
    logOutgoing(jid, payload);
    try {
      const result = await _orig(jid, payload, opts);
      // Tracker les IDs des messages envoyés par le bot
      if (result?.key?.id) {
        global._botSentMessageIds.add(result.key.id);
        if (global._botSentMessageIds.size > BOT_MSG_CACHE_MAX) {
          const first = global._botSentMessageIds.values().next().value;
          global._botSentMessageIds.delete(first);
        }
      }
      return result;
    } catch (sendErr) {
      // [FIX DIAGNOSTIC] Loguer l'erreur EXACTE d'envoi avec le JID et le type de payload
      // Ce log permet d'identifier précisément pourquoi un message n'arrive pas
      const payloadType = payload.text ? 'text' :
                          payload.image ? 'image' :
                          payload.video ? 'video' :
                          payload.audio ? 'audio' :
                          payload.react ? 'react' :
                          payload.delete ? 'delete' : 'unknown';
      const isPrivate = jid && !jid.endsWith('@g.us') && !jid.endsWith('@broadcast');
      console.error(
        `[sendMessage] ❌ ÉCHEC envoi → jid:${jid} type:${payloadType} ` +
        `contexte:${isPrivate ? 'PRIVÉ' : 'GROUPE'} ` +
        `hasQuoted:${!!opts?.quoted} ` +
        `erreur:${sendErr.message}`
      );
      throw sendErr; // Re-propager pour que reply() puisse faire le fallback
    }
  };
}

// ==========================================
// MAIN MESSAGE HANDLER
// ==========================================
const handleMessage = async (sock, msg) => {
  try {
    if (!msg.message) return;
    const from = msg.key.remoteJid;
    if (isSystemJid(from)) return;

    // Cache immédiat pour l'antidelete
    cacheForAntidelete(msg);

    // ── LOG CONSOLE ────────────────────────────────────────
    wrapSendMessage(sock);
    logIncoming(msg);

    // ── DÉTECTION SUPPRESSION ──────────────────────────────
    // [FIX 3] : type 0 = REVOKE standard, type 5 = éphémère supprimé
    const protocolMsg = msg.message?.protocolMessage;
    if (protocolMsg && (protocolMsg.type === 0 || protocolMsg.type === 5) && protocolMsg?.key?.id) {
      await handleDeletedMessage(
        sock,
        protocolMsg.key.id,
        from,
        msg.key.participant || msg.key.remoteJid
      );
      return;
    }

    // ── DÉCODAGE CONTENU ───────────────────────────────────
    const content = getMessageContent(msg);
    let body = '';
    if (content) {
      body = (
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption || ''
      );
    }
    body = (body || '').trim();

    // ── IDENTITÉ EXPÉDITEUR ────────────────────────────────
    // En groupe, msg.key.participant contient le vrai JID de l'expéditeur
    // même si fromMe=true. On l'utilise en priorité pour que isOwner()
    // fonctionne correctement avec les LIDs.
    const _isGroup = from.endsWith('@g.us');
    const sender = (_isGroup && msg.key.participant)
      ? msg.key.participant
      : msg.key.fromMe
        ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
        : msg.key.participant || msg.key.remoteJid;

    const isSuperMe = isSupremeOwner(sender);
    // [FIX SUB-BOT] Si ce socket appartient à une sous-session (.pair),
    // reconnaître aussi le numéro de cette session comme "owner local".
    // Cela permet au sous-bot de répondre à ses propres commandes sans
    // confondre ses messages avec ceux du bot principal.
    const _sessionNum = sock._sessionPhoneNumber
      ? String(sock._sessionPhoneNumber).replace(/\D/g, '')
      : null;
    const _isSessionOwner = _sessionNum
      ? normalizeJid(sender).replace(/\D/g, '').includes(_sessionNum) ||
        _sessionNum.includes(normalizeJid(sender).replace(/\D/g, '').slice(-8))
      : false;
    const isMe      = isSuperMe || isOwner(sender) || msg.key.fromMe || _isSessionOwner;
    const isSudo    = !isMe && isSudoUser(sender);

    // ── [FIX 6] BAN — JAMAIS APPLIED SUR UN OWNER ─────────
    // Ordre strict : d'abord vérifier isMe/isSuperMe, puis ban
    if (!isMe && !isSudo && !msg.key.fromMe && isBannedUser(sender)) return;

    // ── TRACKING ACTIVITÉ MEMBRES (pour .listactive / .listinactive) ────────
    // Guard : trackMemberActivity peut être null si mentstats.js non chargé
    if (_isGroup && !msg.key.fromMe && typeof trackMemberActivity === 'function') {
      try { trackMemberActivity(from, sender); } catch (_) {}
    }

    // ── [FIX 5] MUTE — OWNERS IGNORENT LE MUTE ────────────
    if (!isMe && isMutedContext(from)) {
      if (!isUnmuteCommand(body, config.prefix)) return;
    }

    const isGroup   = from.endsWith('@g.us');
    let isCommand = body.startsWith(config.prefix);

    // ── [SANS PRÉFIXE] Supreme Owner / Owner ──────────────────────────────
    // Seul ce point de détection est modifié. Si l'expéditeur est isMe
    // (Supreme Owner, Owner env, ou fromMe — cf. définition ligne ~942) et
    // que le message n'a pas déjà le préfixe, on vérifie si le premier mot
    // correspond à un nom de commande ou un alias déjà connu de la Map
    // `commands` (chargée une seule fois par commandLoader, O(1) lookup —
    // aucune boucle sur les 193 commandes). Si oui, le message est traité
    // exactement comme s'il avait été préfixé : aucune duplication de
    // logique, tout le reste du pipeline (permissions, cooldowns, aliases,
    // arguments, etc.) reste strictement identique.
    let _ownerNoPrefix = false;
    if (!isCommand && isMe && body) {
      const _firstWord = body.split(/\s+/)[0].toLowerCase();
      if (_firstWord && commands.has(_firstWord)) {
        isCommand = true;
        _ownerNoPrefix = true;
      }
    }

    // [PERF v5] Lazy loading — groupMetadata et botIsAdmin chargés uniquement
    // si nécessaire. Évite 2 appels réseau/cache sur chaque message non-commande.
    let _groupMetadataLoaded = false, _groupMetadata = null;
    let _botIsAdminLoaded    = false, _botIsAdmin    = false;
    const getGroupMeta = async () => {
      if (!isGroup) return null;
      if (!_groupMetadataLoaded) { _groupMetadata = await getGroupMetadata(sock, from); _groupMetadataLoaded = true; }
      return _groupMetadata;
    };
    const getBotAdmin = async () => {
      if (!isGroup) return false;
      if (!_botIsAdminLoaded) { _botIsAdmin = await isBotAdmin(sock, from); _botIsAdminLoaded = true; }
      return _botIsAdmin;
    };
    // Pré-chargement immédiat pour les commandes (évite délais dans execute)
    let groupMetadata = isCommand && isGroup ? await getGroupMeta() : null;
    let botIsAdmin    = isCommand && isGroup ? await getBotAdmin()   : false;

    // ── ANTISPAM : vérification automatique sur chaque message de groupe ──
    if (isGroup && !msg.key.fromMe && !isMe) {
      try {
        // [PERF] Utilise le cache global initialisé au démarrage
        // Évite le require() lazy sur chaque message (coûteux en I/O)
        const antispamMod = global._antispamMod;
        if (antispamMod && typeof antispamMod.checkSpam === 'function') {
          const estSpam = await antispamMod.checkSpam(sock, msg, from, sender);
          if (estSpam) return;
        }
      } catch (_) {}
    }

    // ── PURIFICATION : défense absolue du sanctuaire ──
    if (isGroup && !msg.key.fromMe && !isMe) {
      try {
        // [PERF] Utilise le cache global initialisé au démarrage
        const purMod = global._purificationMod;
        if (purMod && typeof purMod.checkPurification === 'function') {
          const estMenace = await purMod.checkPurification(sock, msg, from, sender);
          if (estMenace) return;
        }
      } catch (_) {}
    }

    // ── RÉACTION SUPREME OWNER — alternance 👨‍💻/🤴, groupes uniquement ──
    // Compteur persistant (survit à un redémarrage) : voir database.getNextSupremeReactionCount().
    // Remplace l'ancienne réaction fixe '👑' par l'alternance stricte demandée.
    if (isSuperMe && isGroup && !msg.key.fromMe) {
      try {
        const n = database.getNextSupremeReactionCount();
        const emoji = (n % 2 === 1) ? '👨‍💻' : '🤴';
        await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
      } catch (_) {}
    }

    // ── AUTO-REACT — seulement pour les utilisateurs autorisés ────
    // En mode non-public, on ne réagit PAS aux messages des users normaux
    const canAutoReact = isMe || isSudo || config.public;
    if (config.autoReact && !msg.key.fromMe && !isSuperMe && canAutoReact) {
      try {
        const emojis = ['❤️','🔥','🤏🏾','💀','😁','✨','👍🏾','🤨','😎','😂','🙏🏾','💫'];
        const mode   = config.autoReactMode || 'bot';
        if (mode === 'bot' && isCommand) {
          await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
        } else if (mode === 'all') {
          await sock.sendMessage(from, { react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: msg.key } });
        }
      } catch (_) {}
    }

    // ── [FIX 2] NLE (ghostgMode) ──────────────────────────
    // ACCÈS RESTREINT : UNIQUEMENT owner + supremeOwner
    // Le NLE ne doit jamais être accessible aux sudo, mods ou users
    const input     = body.trim();
    const argsNLP   = input.split(/\s+/);               // [FIX 9] split propre
    const firstWord = argsNLP[0]?.toLowerCase() || '';

    // ── [FIX NLP] ghostgMode — accès STRICT ─────────────────
    // Le NLP ne répond QUE aux owners et supremeOwners (isMe)
    // JAMAIS aux sudo, premium, ou utilisateurs normaux
    // [FIX SUB-BOT] Désactivé sur les sous-sessions (_sessionPhoneNumber)
    // pour éviter que le sous-bot n'exécute des commandes à la place du
    // bot principal et n'envoie des messages non désirés.
    if (
      isMe &&
      !sock._sessionPhoneNumber &&    // [FIX] NLP désactivé sur sous-sessions
      database.getGhostgMode()?.toLowerCase() === 'on' &&
      !isCommand &&
      input.length > 0
    ) {
      const possibleCmd = commands.get(firstWord); // O(1) - aliases déjà dans la Map
      if (possibleCmd) {
        // [FIX SÉCURITÉ] Bloquer les commandes eval/exec en mode NLP sans préfixe.
        // Sans ce garde, écrire "je vais bien" avec ghostgMode=on déclenchait runeval
        // (alias 'je') → eval("vais bien") → "vais is not defined" envoyé dans le chat.
        // On n'autorise le NLP que sur des commandes sans risque d'exécution de code.
        const BLOCKED_IN_NLP = ['runeval', 'execute', 'master'];
        if (BLOCKED_IN_NLP.includes(possibleCmd.name)) {
          // Silencieusement ignoré — l'owner doit utiliser le préfixe pour ces commandes
        } else {
          try {
            try { await sock.sendMessage(from, { react: { text: '⚜️', key: msg.key } }); } catch (_) {}
            const extra = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);
            await possibleCmd.execute(sock, msg, argsNLP.slice(1), extra);
            return;
          } catch (err) { console.error(`Erreur NLP [${firstWord}]:`, err.message); }
        }
      }
    }

    if (!content) return;
    if (isGroup) addMessage(from, sender);

    // ════════════════════════════════════════════════════════════════
    // AUTO-REPLY — Note vidéo PTV automatique
    // ════════════════════════════════════════════════════════════════
    //
    // DÉCLENCHEUR UNIQUE (v4) :
    //   → Quelqu'un @mentionne/tag le bot dans un groupe
    //
    // COMPORTEMENT :
    //   → Le bot lit autoreply_video.mp4 depuis le disque local
    //   → Envoie une vraie note vidéo ronde (PTV) en réponse au message
    //
    // DÉSACTIVÉ :
    //   → Répondre à un message du bot ne déclenche plus rien
    //
    // DEBUG : ajouter DEBUG_AUTOREPLY=true dans .env pour les logs
    // ──────────────────────────────────────────────────────────────

    // [DEBUG] Activer avec DEBUG_AUTOREPLY=true dans .env
    const _debugAR = process.env.DEBUG_AUTOREPLY === 'true';

    // [FIX A] On exclut seulement les messages envoyés PAR le bot lui-même
    // On n'exclut plus !isMe — l'owner doit aussi pouvoir déclencher l'autoReply
    if (isGroup && !msg.key.fromMe) {
      try {
        // ── Extraction contextInfo depuis TOUS les types de messages ──
        // [FIX autoReply] On utilise 'content' (déjà dépaquété par getMessageContent)
        // plutôt que msg.message brut. Sans ça, les messages éphémères et viewOnce
        // cachent le contextInfo dans ephemeralMessage.message.xxx et la mention
        // n'est jamais détectée (arCtx = null → isBotTargeted = false).
        const mContent = content || msg.message || {};
        const arCtx =
          mContent.extendedTextMessage?.contextInfo    ||
          mContent.imageMessage?.contextInfo           ||
          mContent.videoMessage?.contextInfo           ||
          mContent.audioMessage?.contextInfo           ||
          mContent.stickerMessage?.contextInfo         ||
          mContent.documentMessage?.contextInfo        ||
          mContent.buttonsResponseMessage?.contextInfo ||
          mContent.listResponseMessage?.contextInfo    ||
          null;

        // ── [FIX B] Récupération JID du bot avec support LID ─────────
        // sock.user.id peut être "12345:67@s.whatsapp.net" (standard)
        // ou "12345:67@lid" (nouveau format LID WhatsApp)
        // [FIX v2] Récupération COMPLÈTE du JID du bot — LID + standard
        // PROBLÈME RÉSOLU : sock.user.id peut être un ID LID interne WhatsApp
        // (ex: "12345678901234:0@lid") différent du vrai numéro de téléphone.
        // WhatsApp envoie dans mentionedJid le JID @s.whatsapp.net du bot.
        // → Il faut récupérer TOUTES les formes possibles du JID du bot.
        const botRawId  = sock.user?.id  || '';
        const botLidRaw = sock.user?.lid || '';
        // Numéro pur extrait de l'id principal (sans device suffix ni domaine)
        const botNum    = botRawId.split(':')[0].split('@')[0];
        // Numéro pur extrait du lid (si disponible et différent)
        const botLidNum = botLidRaw ? botLidRaw.split(':')[0].split('@')[0] : '';
        // JID standard s.whatsapp.net
        const botJidS   = botNum + '@s.whatsapp.net';
        // JID LID brut (si applicable)
        const botLid    = botRawId.includes('@lid') ? botRawId :
                          botLidRaw.includes('@lid') ? botLidRaw : null;
        // Ensemble de tous les numéros connus du bot pour comparaison
        const botNums   = new Set([botNum, botLidNum].filter(n => n && n.length >= 8));

        if (_debugAR) {
          console.log('[autoReply] ══ Message reçu ══', {
            from,
            sender,
            botNum,
            botLidNum,
            botNums     : [...botNums],
            botLid,
            fromMe      : msg.key.fromMe,
            msgType     : Object.keys(mContent)[0],
            hasCtx      : !!arCtx,
            stanzaId    : arCtx?.stanzaId,
            participant : arCtx?.participant,
            mentioned   : arCtx?.mentionedJid,
          });
        }

        // ── DÉTECTION : Mention (@tag) du bot uniquement ────────────────
        //
        // [v4] SEULE la MENTION déclenche l'autoReply.
        // Répondre à un message du bot ne déclenche plus rien.
        //
        // MÉTHODE A : mentionedJid dans le contextInfo
        //   WhatsApp remplit mentionedJid quand l'utilisateur @tag quelqu'un.
        //   On cherche dans TOUS les wrappers possibles du message.
        const mentionedJids = [
          ...(arCtx?.mentionedJid || []),
          // Sécurité : certains clients mettent les mentions directement ici
          ...(mContent.extendedTextMessage?.contextInfo?.mentionedJid || []),
        ];
        const uniqueMentioned  = [...new Set(mentionedJids)];
        const isBotMentionedId = uniqueMentioned.some(j => {
          const jNum = j.split(':')[0].split('@')[0];
          return botNums.has(jNum) || (botLid && j === botLid) || j === botJidS;
        });

        // MÉTHODE B : @numéro dans le texte brut du message
        //   Fallback quand mentionedJid est vide (anciens clients, messages vocaux…)
        const arMsgText = (
          mContent.extendedTextMessage?.text ||
          mContent.conversation              ||
          mContent.imageMessage?.caption     ||
          mContent.videoMessage?.caption     || ''
        );
        const isBotMentionedText = [...botNums].some(num => arMsgText.includes('@' + num));

        // Résultat final : bot ciblé ssi et seulement ssi il est @mentionné
        const isBotTargeted = isBotMentionedId || isBotMentionedText;

        // ── Log TOUJOURS VISIBLE quand le bot est ciblé ──────────────
        // (pas derrière _debugAR — pour voir en prod sans changer les env vars)
        if (isBotTargeted) {
          console.log('[autoReply] 🔔 Mention détectée:', {
            from,
            sender,
            botNums        : [...botNums],
            uniqueMentioned,
            isBotMentionedId,
            isBotMentionedText,
            msgType        : Object.keys(mContent)[0] || 'unknown',
          });
        }

        if (_debugAR && !isBotTargeted) {
          console.log('[autoReply] ══ Détection ══', {
            isBotMentionedId,
            isBotMentionedText,
            isBotTargeted,
            botNum,
            botNums        : [...botNums],
            uniqueMentioned,
            arMsgTextSlice : arMsgText.slice(0, 60),
          });
        }

        if (isBotTargeted) {
          // ── Chargement de la config autoreply ──────────────────────
          // ✅ FIX : Lecture UNIQUEMENT depuis le JSON global (data/autoreply_video.json)
          // La config est globale au bot — pas liée à un groupe spécifique.
          // Le JSON est la source de vérité unique, écrit par .reply
          let arCfg = null;

          // [PERF] Lecture depuis le cache mémoire (30s TTL) au lieu de readFileSync
          arCfg = getArCfgCached();

          // [FIX v5] Log TOUJOURS visible pour diagnostiquer en production
          console.log('[autoReply] ══ Config ══', arCfg ? {
            active    : arCfg.active,
            mediaType : arCfg.mediaType,
            isPtv     : arCfg.isPtv,
            localPath : arCfg.localPath,
            fileExists: arCfg.localPath ? require('fs').existsSync(arCfg.localPath) : false,
            setAt     : arCfg.setAt ? new Date(arCfg.setAt).toLocaleString('fr-FR') : '?',
          } : 'AUCUNE CONFIG TROUVÉE');

          if (!arCfg?.active) {
            // [FIX v5] Aucune vidéo configurée → informer l'utilisateur clairement
            console.log('[autoReply] ℹ️ Mention détectée mais aucune note vidéo configurée → message d\'info envoyé');
            try {
              await sock.sendMessage(from, {
                text: `*📭 Aucune note vidéo configurée*\n\nLe propriétaire du bot n'a pas encore enregistré de réponse automatique.\n\n> _♛ 𝐃𝐈𝐏𝐏𝐄𝐑_`,
              }, { quoted: msg });
            } catch (_) {}
            // [FIX] NE PAS return ici — continuer pour traiter la commande éventuelle
          } else {
            // ── Délai optionnel ───────────────────────────────────────
            if (arCfg.delay && arCfg.delay > 0) {
              await new Promise(r => setTimeout(r, arCfg.delay));
            }

            // ── Lecture du fichier local ──────────────────────────────
            const mediaFilePath = arCfg.localPath || path.join(process.cwd(), 'database', 'sessions', sessionContext.getCurrentSessionId(), 'autoreply_video.mp4');

            console.log(`[autoReply] 📂 Chemin fichier: ${mediaFilePath}`);
            console.log(`[autoReply] 📁 Fichier existe: ${fs.existsSync(mediaFilePath)}`);

            if (!fs.existsSync(mediaFilePath)) {
              console.error('[autoReply] ❌ Fichier média introuvable:', mediaFilePath);
              console.error('[autoReply] → Refaites la commande .reply en répondant à une vidéo');
              // [FIX v5] Informer l'utilisateur au lieu de silencieusement échouer
              try {
                await sock.sendMessage(from, {
                  text: `*⚠️ Erreur note vidéo*\n\nLe fichier vidéo enregistré est introuvable.\nLe propriétaire doit reconfigurer avec \`.reply\`.\n\n> _♛ 𝐃𝐈𝐏𝐏𝐄𝐑_`,
                }, { quoted: msg });
              } catch (_) {}
              // [FIX] Continuer sans return pour traiter la commande éventuelle
            } else {
              try {
                // [FIX 8] fs.promises.readFile (async) remplace fs.readFileSync (bloquant).
                // readFileSync bloque l'event loop Node.js pendant toute la lecture :
                // une vidéo de 5 Mo = plusieurs secondes où AUCUN message ne peut
                // être traité. Avec readFile async, l'event loop reste libre.
                const mediaBuf  = await fs.promises.readFile(mediaFilePath);
                const mediaType = arCfg.mediaType || 'videoMessage';

                console.log(`[autoReply] 📊 Fichier lu: ${mediaBuf?.length ?? 0} bytes | type: ${mediaType}`);

                // [FIX] Valider que le fichier est exploitable (> 1 Ko)
                // Un fichier de 0 octet ou corrompu ferait échouer sendMessage silencieusement
                if (!mediaBuf || mediaBuf.length < 1024) {
                  console.error(`[autoReply] ❌ Fichier média invalide (${mediaBuf?.length ?? 0} bytes) → refaites .reply`);
                  try {
                    await sock.sendMessage(from, {
                      text: `*⚠️ Fichier vidéo corrompu*\n\nLe propriétaire doit reconfigurer avec \`.reply\`.\n\n> _♛ 𝐃𝐈𝐏𝐏𝐄𝐑_`,
                    }, { quoted: msg });
                  } catch (_) {}
                } else {
                  // Log permanent (toujours visible, pas besoin de DEBUG_AUTOREPLY)
                  console.log(`[autoReply] ✅ Mention détectée — envoi ${mediaType} PTV (${mediaBuf.length} bytes) → ${from}`);

                  // ── Envoi selon le type ───────────────────────────────
                  if (mediaType === 'videoMessage') {
                    // NOTE VIDÉO RONDE (PTV) — toujours forcé pour les vidéos
                    await sock.sendMessage(from, {
                      video   : mediaBuf,
                      mimetype: 'video/mp4',
                      ptv     : true,
                    }, { quoted: msg });

                  } else if (mediaType === 'audioMessage') {
                    await sock.sendMessage(from, {
                      audio   : mediaBuf,
                      mimetype: arCfg.mimetype || 'audio/ogg; codecs=opus',
                      ptt     : true,
                    }, { quoted: msg });

                  } else if (mediaType === 'imageMessage') {
                    await sock.sendMessage(from, {
                      image   : mediaBuf,
                      mimetype: arCfg.mimetype || 'image/jpeg',
                      caption : '',
                    }, { quoted: msg });
                  }

                  console.log(`[autoReply] ✅ Média envoyé avec succès → groupe: ${from}`);
                }

              } catch (sendErr) {
                console.error('[autoReply] ❌ Erreur envoi:', sendErr.message, sendErr.stack);
              }
            }
            // Après envoi du PTV, continuer normalement si c'est aussi une commande
            // (ex: user @tag le bot ET envoie .menu en même temps)
            if (!isCommand) return;
          }
        }
      } catch (arErr) {
        console.error('[autoReply] ❌ Erreur générale:', arErr.message, arErr.stack);
        // On ne fait PAS de return ici pour ne pas bloquer les autres handlers
      }
    }

    // ── BUTTON RESPONSES ────────────────────────────────────
    const btn = content.buttonsResponseMessage || msg.message?.buttonsResponseMessage;
    if (btn) {
      const cmdMap     = { btn_menu: 'menu', btn_ping: 'ping', btn_help: 'list' };
      const targetName = cmdMap[btn.selectedButtonId];
      if (targetName) {
        const targetCmd = commands.get(targetName);
        if (targetCmd) {
          if (!_groupMetadataLoaded) { groupMetadata = await getGroupMeta(); }
          if (!_botIsAdminLoaded)    { botIsAdmin    = await getBotAdmin(); }
          const extra = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);
          await targetCmd.execute(sock, msg, [], extra);
        }
        return;
      }
    }

    // ── SÉCURITÉ GROUPES ────────────────────────────────────
    if (isGroup) {
      const groupSettings = database.getGroupSettings(from);

      // [PERF v5] Charger groupMetadata + botIsAdmin si pas encore fait
      // (nécessaire pour les protections de groupe)
      if (!_groupMetadataLoaded) { groupMetadata = await getGroupMeta(); }
      if (!_botIsAdminLoaded)    { botIsAdmin    = await getBotAdmin(); }

      // ANTI-ALL
      if (groupSettings.antiall && !isMe && !isSudo && botIsAdmin) {
        const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
        if (!senderIsAdmin) { await sock.sendMessage(from, { delete: msg.key }); return; }
      }

      // ANTI-TAG
      if (groupSettings.antitag && !msg.key.fromMe && !isMe && !isSudo) {
        const ctx             = content.extendedTextMessage?.contextInfo;
        const mentionedJids   = ctx?.mentionedJid || [];
        const numericMentions = body.match(/@\d{10,}/g) || [];
        const uniqueNums      = new Set(numericMentions.map(m => m.match(/@(\d+)/)?.[1]).filter(Boolean));
        const totalMentions   = Math.max(mentionedJids.length, uniqueNums.size);
        if (totalMentions >= 3) {
          const participants     = groupMetadata?.participants || [];
          const mentionThreshold = Math.max(3, Math.ceil(participants.length * 0.5));
          const hasManyMentions  = uniqueNums.size >= 10 || (uniqueNums.size >= 5 && uniqueNums.size >= mentionThreshold);
          if (totalMentions >= mentionThreshold || hasManyMentions) {
            const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
            if (!senderIsAdmin && !isAllowedUser(sender, groupSettings)) {
              const action = (groupSettings.antitagAction || 'delete').toLowerCase();
              await sock.sendMessage(from, { delete: msg.key });
              if (action === 'kick' && botIsAdmin) {
                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                await sock.sendMessage(from, {
                  text: `⚔️ *Sᴀɴᴄᴛɪᴏɴ Sᴜᴘʀᴇ̂ᴍᴇ !*\n\n@${sender.split('@')[0]} a été purifiée.`,
                  mentions: [sender]
                });
              } else {
                await sock.sendMessage(from, {
                  text: '⚡ *Iɴᴠᴏᴄᴀᴛɪᴏɴ Iʟʟᴇ́ɢᴀʟᴇ !* Sɪʟᴇɴᴄᴇ ɪᴍᴘᴏsᴇ́.',
                  mentions: [sender]
                });
              }
              return;
            }
          }
        }
      }

      // [FIX REPERE] Guard !msg.key.fromMe : les messages envoyés PAR le bot
      // (ex: .repere avec forwardedNewsletterMessageInfo) ne doivent JAMAIS
      // [PERF] Pré-calculer une seule fois le corps texte et le type de message
      // pour les systèmes automatiques — évite de le recalculer dans chaque handler
      const _hasText    = !!(msg.message?.conversation || msg.message?.extendedTextMessage?.text ||
                             msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption);
      const _hasMedia   = !!(msg.message?.imageMessage || msg.message?.videoMessage ||
                             msg.message?.audioMessage || msg.message?.documentMessage);
      const _hasSticker = !!msg.message?.stickerMessage;

      // déclencher antigroupmention ou antilink — sinon le bot tente de supprimer
      // son propre message et peut crasher/bloquer le handler.
      // [PERF] antilink/antibadword seulement sur messages avec texte
      if (groupSettings.antigroupmention && !msg.key.fromMe) await handleAntigroupmention(sock, msg, groupMetadata);
      if (groupSettings.antilink && !msg.key.fromMe && _hasText) await handleAntilink(sock, msg, groupMetadata);
      // [NOUVEAU] AI Moderator — détection spam/insultes/flood, réellement branchée
      if (groupSettings.aiModerator && !msg.key.fromMe && _hasText) try { await handleAiModerator(sock, msg, groupMetadata); } catch(_) {}
      // [FIX] handleAntistatusmention — handler manquant, ajouté ici
      if (groupSettings.antistatusmention && !msg.key.fromMe) await handleAntistatusmention(sock, msg, groupMetadata);

      // ── NOUVELLES PROTECTIONS ───────────────────────────────────────────
      const ph = getProtHandlers().handlers || getProtHandlers();
      // [PERF] Chaque handler ne traite que les messages qui le concernent
      if (groupSettings.antibadword  && _hasText)    try { await ph.handleAntibadword?.(sock, msg, groupMetadata); }  catch(_) {}
      if (groupSettings.antibot)                     try { await ph.handleAntibot?.(sock, msg, groupMetadata); }      catch(_) {}
      if (groupSettings.antiforeign)                 try { await ph.handleAntiforeign?.(sock, msg, groupMetadata); }  catch(_) {}
      if (groupSettings.antiforward)                 try { await ph.handleAntiforward?.(sock, msg, groupMetadata); }  catch(_) {}
      if (groupSettings.antimessage)                 try { await ph.handleAntimessage?.(sock, msg, groupMetadata); }  catch(_) {}
      if (groupSettings.antisticker  && _hasSticker) try { await ph.handleAntisticker?.(sock, msg, groupMetadata); } catch(_) {}
      if (groupSettings.antitagadmin && _hasText)    try { await ph.handleAntitagadmin?.(sock, msg, groupMetadata); } catch(_) {}

      // AUTO-STICKER — Fonctionne pour tous les membres du groupe une fois
      // activé par un admin. Owner/sudo exemptés du cooldown (comme avant) ;
      // les autres membres sont soumis à une protection anti-spam légère
      // (voir commands/group_management/autosticker.js → canAutoSticker).
      if (groupSettings.autosticker && (content?.imageMessage || content?.videoMessage) && !isCommand) {
        const { canAutoSticker } = require('./commands/group_management/autosticker');
        const stickerAllowed = isMe || isSudo || canAutoSticker(sender);
        if (stickerAllowed) {
          const stickerCmd = commands.get('sticker');
          if (stickerCmd) {
            const extra = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);
            await stickerCmd.execute(sock, msg, [], extra);
            return;
          }
        }
      }
    }

    // ── NAVIGATION MENU PAR RÉPONSE ──────────────────────────────────────
    // Une réponse (quote) à un message de menu, contenant un numéro valide,
    // affiche la catégorie correspondante. Ne se déclenche JAMAIS sur un
    // simple "3" envoyé ailleurs dans le chat — uniquement en réponse
    // directe à un message de menu suivi (voir menu.js → trackMenu).
    if (!msg.key.fromMe && msg.message?.extendedTextMessage?.contextInfo?.stanzaId) {
      try {
        const { handleMenuNavigationReply } = require('./commands/general_tools/menu');
        const extraNav = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);
        const navResult = await handleMenuNavigationReply(sock, msg, extraNav);

        if (navResult.reExecute) {
          // ⚠️ SÉCURITÉ : l'utilisateur a confirmé ("oui") l'exécution
          // d'une commande précédemment corrigée par le moteur de
          // correction floue. On NE l'exécute PAS directement ici — on
          // reconstruit un message synthétique avec le nom corrigé et on
          // le fait retraverser tout le pipeline normal (handleMessage),
          // pour que toutes les vérifications de permissions/cooldowns/
          // hiérarchie d'accès s'appliquent exactement comme si
          // l'utilisateur avait tapé la commande correctement lui-même.
          // Aucune logique de permission n'est dupliquée ni contournée.
          const { commandName: correctedName, args: correctedArgs, originalMsg } = navResult.reExecute;
          const correctedText = `${config.prefix}${correctedName} ${(correctedArgs || []).join(' ')}`.trim();
          const syntheticMsg = {
            ...originalMsg,
            key: { ...originalMsg.key, id: `${originalMsg.key.id}_fzc` }, // id distinct pour éviter tout anti-doublon
            message: { conversation: correctedText },
          };
          await handleMessage(sock, syntheticMsg);
          return;
        }

        if (navResult.handled) return;
      } catch (_) {}
    }

    // ── CUSTOM REPLY — réponses automatiques personnalisées ─────────────
    // Fonctionne en groupe ET en DM (contrairement au bloc anti-protections
    // ci-dessus, réservé aux groupes). Protections :
    //  - jamais sur les messages du bot lui-même (pas de boucle)
    //  - jamais sur un message reconnu comme une commande (évite le double
    //    traitement et les réponses multiples)
    //  - une seule réponse envoyée, puis on arrête le traitement de ce message
    if (!msg.key.fromMe && !isCommand && body) {
      try {
        const { getCustomReplies } = require('./commands/group_management/custommenu');
        const replies = getCustomReplies(from);
        const bodyKey = body.trim().toLowerCase();
        if (replies && Object.prototype.hasOwnProperty.call(replies, bodyKey)) {
          await sock.sendMessage(from, { text: replies[bodyKey] }, { quoted: msg });
          return;
        }
      } catch (_) {}
    }

    // ── JEUX ACTIFS ─────────────────────────────────────────
    try {
      const bombModule = global.commands?.get('bomb') ? { gameState: new Map() } : null;
      // Note: bomb & tictactoe commands not present in this build — guard below
      if (false && bombModule) {
        const bombCmd = commands.get('bomb');
        if (bombCmd) {
          const extra = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);
          await bombCmd.execute(sock, msg, [], extra);
          return;
        }
      }
    } catch (_) {}

    try {
      const tttModule = global.commands?.get('tictactoe') || null;
      if (tttModule && tttModule.handleTicTacToeMove) {
        const isInGame = Object.values(tttModule.games || {}).some(r =>
          r.id.startsWith('tictactoe') &&
          [r.game.playerX, r.game.playerO].includes(sender) &&
          r.state === 'PLAYING'
        );
        if (isInGame) {
          const extra   = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);
          const handled = await tttModule.handleTicTacToeMove(sock, msg, extra);
          if (handled) return;
        }
      }
    } catch (_) {}

    // ── COMMANDES CLASSIQUES ────────────────────────────────
    if (!isCommand) return;

    const rawArgs    = (_ownerNoPrefix ? body : body.slice(config.prefix.length)).trim().split(/\s+/);
    const commandName = rawArgs.shift().toLowerCase();
    const args        = rawArgs;
    let command = commands.get(commandName); // O(1) - aliases déjà dans la Map par commandLoader

    // ── CORRECTION AUTOMATIQUE DES FAUTES DE FRAPPE ──────────────────────
    // Commande introuvable telle quelle : tente une correction floue
    // (voir commands/general_tools/menu.js → fuzzyMatchCommand).
    // ⚠️ Aucune commande n'est jamais exécutée directement ici : soit une
    // demande de confirmation est envoyée (candidat unique très confiant,
    // >95%), soit une liste de suggestions (candidats ambigus), soit un
    // simple "Commande inconnue." (rien d'assez proche). L'exécution
    // éventuelle, après confirmation "oui", passe par le bloc de
    // navigation menu plus haut (reExecute → handleMessage).
    if (!command) {
      try {
        const { handleUnknownCommand } = require('./commands/general_tools/menu');
        const extraForFuzzy = await buildExtra(sock, msg, from, sender, isGroup, groupMetadata, isMe, isSuperMe, botIsAdmin, isSudo);
        await handleUnknownCommand(sock, msg, extraForFuzzy, commandName, args);
      } catch (_) {}
      return; // dans tous les cas (confirmation proposée, suggestions, ou
              // "commande inconnue"), une réponse a déjà été envoyée —
              // rien à exécuter directement ici (voir règle de sécurité)
    }

    // ── RÉACTION ⚜️ — Owner / Supreme Owner, à chaque commande exécutée ──
    // Restaure/généralise la réaction que l'ancien bloc NLP "ghostgMode"
    // envoyait uniquement en mode sans-préfixe ET quand GHOSTG_MODE=on.
    // Ici : systématique pour isMe, avec OU sans préfixe, peu importe l'état
    // de ghostgMode — un seul point, avant l'exécution réelle de la commande.
    if (isMe) {
      try { await sock.sendMessage(from, { react: { text: '⚜️', key: msg.key } }); } catch (_) {}
    }

    // ══════════════════════════════════════════════════════════
    // HIÉRARCHIE D'ACCÈS — 5 NIVEAUX (FIX COMPLET)
    //
    // NIVEAU 1 : isMe (owner + supremeOwner + fromMe)
    //            → TOUJOURS autorisé, aucun blocage possible
    //
    // NIVEAU 2 : isSudo
    //            → Autorisé SAUF commandes ownerOnly/souveraineté
    //            → Passe même en selfMode
    //
    // NIVEAU 3 : config.selfMode = true  (SELF_MODE=true dans .env)
    //            → Bot personnel : SEULS owner + sudo passent
    //            → TOUS les autres utilisateurs : silence total
    //
    // NIVEAU 4 : config.public = true   (PUBLIC_MODE=true dans .env)
    //            → Bot public : TOUS les utilisateurs peuvent utiliser les commandes
    //            → Sauf ownerOnly et commandes protégées
    //
    // NIVEAU 5 : ni selfMode ni public (défaut)
    //            → Bot semi-public : seuls owner + sudo + premium passent
    //            → Les utilisateurs normaux sont bloqués silencieusement
    //            → C'est le mode le plus sûr par défaut
    //
    // ⚠️  RÈGLE ABSOLUE : si PUBLIC_MODE=false et SELF_MODE=false,
    //     le bot NE RÉPOND PAS aux utilisateurs non autorisés.
    //     Pour ouvrir le bot au public, mettre PUBLIC_MODE=true dans .env
    // ══════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════
    // HIÉRARCHIE D'ACCÈS — Système Centralisé (accessControl.js)
    //
    // NIVEAU 1 : isMe (owner + supremeOwner + fromMe)
    //            → TOUJOURS autorisé, aucun blocage possible
    //
    // NIVEAU 2 : isSudo
    //            → Autorisé SAUF commandes ownerOnly/souveraineté
    //            → Passe même en selfMode
    //
    // NIVEAU 3 : config.selfMode = true  (SELF_MODE=true dans .env)
    //            → Bot personnel : SEULS owner + sudo passent
    //            → TOUS les autres utilisateurs : silence total
    //
    // NIVEAU 4 : config.public = true   (PUBLIC_MODE=true dans .env)
    //            → Bot public : TOUS les utilisateurs peuvent utiliser
    //            → Sauf ownerOnly et commandes protégées
    //
    // NIVEAU 5 : ni selfMode ni public (défaut)
    //            → Bot semi-public : seuls owner + sudo + premium passent
    //            → Les utilisateurs normaux sans accès sont bloqués
    //
    // ⚠️  Les vérifications premium/vip/sudo sont déléguées à
    //     accessControl.js — une seule logique pour tout le bot.
    // ══════════════════════════════════════════════════════════
    if (!isMe) {
      // Niveau 2 : Sudo — bypass selfMode, bloqué sur ownerOnly + catégorie souveraineté
      if (isSudo) {
        if (command.ownerOnly || command.category === SUDO_BLOCKED_CATEGORY) {
          const { sudoDeniedMessage } = require('./utils/accessControl');
          return sock.sendMessage(from, { text: sudoDeniedMessage() }, from.endsWith('@g.us') ? { quoted: msg } : undefined);
        }
        // Sudo autorisé → continue
      }
      // Niveau 3 : Mode self (bot personnel) — silence total pour non-owner
      else if (config.selfMode) {
        return; // Silence total
      }
      // Niveau 4 & 5 : Mode public OU mode défaut
      else {
        // ── Vérification centralisée des permissions ─────────────────
        const { checkAccess } = require('./utils/accessControl');
        const access = checkAccess({
          sender,
          isMe,
          isSuperMe,
          isSudo,
          command,
        });

        if (!access.allowed) {
          // Accès refusé — envoyer le message de refus approprié
          console.log(`[handler] 🔒 Accès refusé (${access.reason}) — cmd:${commandName} sender:${sender}`);
          return sock.sendMessage(from, { text: access.message }, from.endsWith('@g.us') ? { quoted: msg } : undefined);
        }

        // En mode défaut (non public), si pas de niveau d'accès spécifique
        // et que l'utilisateur n'est ni premium ni vip → bloquer silencieusement
        if (!config.public && access.reason === null) {
          const isPublicCmd = !command.premiumOnly && !command.vipOnly &&
            !command.sudoOnly && !command.ownerOnly &&
            (!command.accessLevel || command.accessLevel === 'public');

          if (isPublicCmd) {
            // Commande publique mais bot en mode semi-public
            // Vérifier que l'utilisateur est premium ou vip
            const { isPremium, isVip } = require('./utils/accessControl');
            if (!isPremium(sender) && !isVip(sender)) {
              console.log(`[handler] 🔒 Mode défaut — cmd:${commandName} sender:${sender} → bloqué`);
              return;
            }
          }
        }
      }
    }

    // ── GUARDS COMMANDES ────────────────────────────────────
    if (command.ownerOnly && !isMe) {
      const ownerMsgs = [
        `👑 *ᴄᴇ ᴘᴏᴜᴠᴏɪʀ ᴀᴘᴘᴀʀᴛɪᴇɴᴛ ᴀᴜ ᴍᴀɪ̂ᴛʀᴇ sᴇᴜʟ.*`,
        `🔒 *sᴇᴜʟ ʟ'ᴀʀᴛɪsᴀɴ ᴘᴇᴜᴛ ᴍᴀɴɪᴇʀ ᴄᴇᴄɪ.*`,
        `⛔ *ᴄᴇᴛ ᴀʀᴄᴀɴᴇ ᴇsᴛ ʀᴇ́sᴇʀᴠᴇ́ ᴀᴜ sᴏᴜᴠᴇʀᴀɪɴ.*`,
      ];
      return sock.sendMessage(from, {
        text: ownerMsgs[Math.floor(Math.random() * ownerMsgs.length)]
      }, from.endsWith('@g.us') ? { quoted: msg } : undefined);
    }

    if (command.modOnly && !isMod(sender) && !isMe) {
      const modMsgs = [
        `🛡️ *ʀᴇ́sᴇʀᴠᴇ́ ᴀᴜx ɢᴀʀᴅɪᴇɴs ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ.*`,
        `⚜️ *ᴀᴄᴄᴇ̀s ɪɴᴛᴇʀᴅɪᴛ — ɴɪᴠᴇᴀᴜ ɪɴsᴜꜰꜰɪsᴀɴᴛ.*`,
        `🔐 *ᴄᴇᴛᴛᴇ ᴢᴏɴᴇ ᴇsᴛ ʀᴇ́sᴇʀᴠᴇ́ᴇ.*`,
      ];
      return sock.sendMessage(from, {
        text: modMsgs[Math.floor(Math.random() * modMsgs.length)]
      }, from.endsWith('@g.us') ? { quoted: msg } : undefined);
    }

    if (command.groupOnly && !isGroup) {
      const groupMsgs = [
        `🏰 *ᴄᴇᴛᴛᴇ ᴍᴀɢɪᴇ ɴ'ᴏᴘᴇ̀ʀᴇ ǫᴜᴇ ᴅᴀɴs ᴜɴ sᴀɴᴄᴛᴜᴀɪʀᴇ.*`,
        `👥 *ʀᴇɴᴅs-ᴛᴏɪ ᴅᴀɴs ᴜɴ ɢʀᴏᴜᴘᴇ ᴘᴏᴜʀ ᴜᴛɪʟɪsᴇʀ ᴄᴇᴄɪ.*`,
        `⚠️ *ᴄᴏᴍᴍᴀɴᴅᴇ ᴅɪsᴘᴏɴɪʙʟᴇ ᴜɴɪǫᴜᴇᴍᴇɴᴛ ᴇɴ ɢʀᴏᴜᴘᴇ.*`,
      ];
      return sock.sendMessage(from, {
        text: groupMsgs[Math.floor(Math.random() * groupMsgs.length)]
      }, from.endsWith('@g.us') ? { quoted: msg } : undefined);
    }

    if (command.privateOnly && isGroup) {
      const privMsgs = [
        `🤫 *ᴘᴀʀʟᴇ-ᴍᴏɪ ᴇɴ ᴘʀɪᴠᴇ́ ᴘᴏᴜʀ ᴄᴇʟᴀ.*`,
        `📩 *ᴄᴇᴄɪ ꜰᴏɴᴄᴛɪᴏɴɴᴇ sᴇᴜʟᴇᴍᴇɴᴛ ᴇɴ ᴍᴇssᴀɢᴇ ᴘʀɪᴠᴇ́.*`,
        `🔏 *ᴇɴᴠᴏɪᴇ ᴄᴇᴛᴛᴇ ᴄᴏᴍᴍᴀɴᴅᴇ ᴅɪʀᴇᴄᴛᴇᴍᴇɴᴛ ᴇɴ ᴘʀɪᴠᴇ́.*`,
      ];
      return sock.sendMessage(from, {
        text: privMsgs[Math.floor(Math.random() * privMsgs.length)]
      }, from.endsWith('@g.us') ? { quoted: msg } : undefined);
    }

    if (command.adminOnly && !isMe && !(await isAdmin(sock, sender, from, groupMetadata))) {
      const adminMsgs = [
        `🛡️ *sᴇᴜʟs ʟᴇs ɢᴀʀᴅɪᴇɴs ᴘᴇᴜᴠᴇɴᴛ ᴇxᴇ́ᴄᴜᴛᴇʀ ᴄᴇᴄɪ.*`,
        `⚠️ *ᴛᴜ ɴ'ᴀs ᴘᴀs ʟᴇ ʀᴀɴɢ ɴᴇ́ᴄᴇssᴀɪʀᴇ.*`,
        `🔒 *ᴘʀɪᴠɪʟᴇ̀ɢᴇ ᴀᴅᴍɪɴ ʀᴇǫᴜɪs.*`,
      ];
      return sock.sendMessage(from, {
        text: adminMsgs[Math.floor(Math.random() * adminMsgs.length)]
      }, from.endsWith('@g.us') ? { quoted: msg } : undefined);
    }

    if (command.botAdminNeeded && !botIsAdmin) {
      // [FIX RACINE] Le cache 5 min peut retourner un statut admin périmé.
      // Avant de bloquer la commande, on force un fetch réseau frais pour
      // confirmer que le bot n'est vraiment pas admin.
      // Si le fetch live dit qu'il EST admin → on corrige botIsAdmin et on continue.
      if (isGroup) {
        try {
          const liveMeta = await Promise.race([
            sock.groupMetadata(from),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
          ]);
          if (liveMeta?.participants) {
            // Invalider le cache avec les données fraîches
            groupMetadataCache.set(sessionContext.scopeKey(from), { data: liveMeta, timestamp: Date.now() });

            const rawIds = [sock.user?.id, sock.user?.lid].filter(Boolean);

            // [FIX LID] Même correctif que isBotAdmin() : utiliser findParticipant()
            // pour gérer les groupes WA récents où p.id est en format '@lid'.
            const botJidsLive = rawIds.flatMap(id => {
              const num = id.split(':')[0].split('@')[0];
              return [id, `${num}@s.whatsapp.net`, `${num}@c.us`];
            }).filter(Boolean);

            const botEntryLive = findParticipant(liveMeta.participants, botJidsLive);
            let liveCheck = false;
            if (botEntryLive) {
              const adm = botEntryLive.admin ?? botEntryLive.isAdmin ?? botEntryLive.isSuperAdmin;
              liveCheck = adm === 'admin' || adm === 'superadmin' || adm === true;
              console.log(`[handler][FIX-LID] liveCheck bot: ${botEntryLive.id} | admin=${botEntryLive.admin} | liveCheck=${liveCheck}`);
            } else {
              console.log(`[handler][FIX-LID] bot non trouvé dans liveMeta — botJids: ${botJidsLive.join(', ')}`);
              console.log(`[handler][FIX-LID] Participants ids: ${liveMeta.participants.map(p => p.id).join(', ')}`);
            }

            if (liveCheck) {
              // Le bot EST admin selon le réseau — le cache était périmé
              botIsAdmin = true;
              console.log(`[handler][FIX] Cache périmé corrigé pour ${from} — bot IS admin (live confirm)`);
            }
          }
        } catch (liveErr) {
          console.error(`[handler][FIX] Live fetch échoué: ${liveErr.message}`);
        }
      }

      // Si après le re-fetch le bot n'est toujours pas admin → bloquer
      if (!botIsAdmin) {
        const botAdminMsgs = [
          `⚙️ *𝐃𝐈𝐏𝐏𝐄𝐑 ᴅᴏɪᴛ ᴅ'ᴀʙᴏʀᴅ ᴇ̂ᴛʀᴇ ᴀᴅᴍɪɴ — ʟ'ᴏᴍʙʀᴇ ᴏʙᴇ́ɪᴛ ᴀ̀ sᴇs ᴘʀᴏᴘʀᴇs ʟᴏɪs.*`,
          `🛠️ *ᴀᴄᴄᴏʀᴅᴇ ʟᴇ ʀᴀɴɢ ᴅ'ᴀᴅᴍɪɴ ᴀᴜ ʙᴏᴛ ᴅ'ᴀʙᴏʀᴅ.*`,
          `🔑 *ʟᴇ ʙᴏᴛ ɴᴇ ᴘᴇᴜᴛ ᴀɢɪʀ sᴀɴs ʟᴇs ᴅʀᴏɪᴛs ᴀᴅᴍɪɴ.*`,
        ];
        return sock.sendMessage(from, {
          text: botAdminMsgs[Math.floor(Math.random() * botAdminMsgs.length)]
        }, from.endsWith('@g.us') ? { quoted: msg } : undefined);
      }
    }

    if (config.autoTyping) await sock.sendPresenceUpdate('composing', from);

    // [PERF] isAdmin calculé ici une seule fois (évite appel redondant dans buildExtra)
    const _senderIsAdmin = isGroup ? await isAdmin(sock, sender, from, groupMetadata) : false;

    const extra = await buildExtra(
      sock, msg, from, sender,
      isGroup, groupMetadata,
      isMe, isSuperMe, botIsAdmin, isSudo,
      _senderIsAdmin
    );
    await command.execute(sock, msg, args, extra);

  } catch (error) {
    if (error.message?.includes('rate-overlimit')) return;

    // [FIX] Log détaillé de toutes les erreurs d'exécution pour diagnostic
    console.error(`[handler] ❌ Erreur execute — cmd:${msg?.key?.remoteJid?.endsWith('@g.us') ? 'groupe' : 'privé'} jid:${msg?.key?.remoteJid} : ${error.message}`);

    // Essayer d'envoyer le message d'erreur à l'utilisateur
    // Tentative 1 : avec quoted
    // Tentative 2 : sans quoted (fallback si quoted rejette en privé)
    const errMsgs = [
      `❌ *ʟ'ɪɴᴄᴀɴᴛᴀᴛɪᴏɴ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ :*\n\n_${error.message}_`,
      `⚠️ *ᴜɴ ᴏʙsᴛᴀᴄʟᴇ sᴛᴏᴘᴘᴇ ʟ'ᴇxᴇ́ᴄᴜᴛɪᴏɴ :*\n\n_${error.message}_`,
      `🔴 *ᴏᴘᴇ́ʀᴀᴛɪᴏɴ ɪɴᴛᴇʀʀᴏᴍᴘᴜᴇ :*\n\n_${error.message}_`,
    ];
    const destJid   = msg?.key?.remoteJid;
    const destPrivé = destJid && !destJid.endsWith('@g.us');
    if (!destJid) return;

    // [FIX] En privé : jamais de quoted — même correctif que reply()
    if (destPrivé) {
      try {
        await sock.sendMessage(destJid, { text: errText });
      } catch (sendErr) {
        console.error(`[handler] ❌ Envoi erreur en privé échoué : ${sendErr.message}`);
      }
    } else {
      try {
        await sock.sendMessage(destJid, { text: errText }, { quoted: msg });
      } catch (sendErr1) {
        console.warn(`[handler] ⚠️ Envoi erreur groupe avec quoted échoué : ${sendErr1.message}`);
        try {
          await sock.sendMessage(destJid, { text: errText });
        } catch (sendErr2) {
          console.error(`[handler] ❌ Envoi erreur groupe sans quoted aussi échoué : ${sendErr2.message}`);
        }
      }
    }
  }
};

// ==========================================
// GROUP UPDATES (welcome / goodbye)
// ==========================================
const handleGroupUpdate = async (sock, update) => {
  try {
    const { id, participants, action } = update;
    if (!id?.endsWith('@g.us')) return;

    // ── ANTIDEMOTE ──────────────────────────────────────────────────────────
    if (action === 'demote') {
      try {
        const ph = getProtHandlers().handlers || getProtHandlers();
        await ph.handleAntidemote?.(sock, update, null);
      } catch(_) {}
    }

    // ── PROMOTE / DEMOTE — message personnalisé (customwelcome) ─────────────
    // Aucun message générique n'existait pour ces événements avant ce
    // branchement : la notification ne se déclenche que si un message
    // personnalisé a été explicitement configuré via .customwelcome —
    // pas de nouveau comportement par défaut pour les groupes existants.
    if (action === 'promote' || action === 'demote') {
      try {
        const { getCustomEventMessage } = require('./commands/group_management/custommenu');
        let meta = null;
        for (const participant of participants) {
          const pJid = participant?.id || participant?.jid || participant?.participant ||
                       (typeof participant === 'string' ? participant : null);
          if (!pJid) continue;
          if (!meta) { try { meta = await sock.groupMetadata(id); } catch (_) { meta = { subject: '', participants: [] }; } }
          const pNumber = pJid.split('@')[0];
          const customMsg = getCustomEventMessage(id, action, {
            nom: pNumber, numero: pNumber,
            groupe: meta.subject || '', total: meta.participants?.length || 0,
          });
          if (customMsg) {
            await sock.sendMessage(id, { text: customMsg, mentions: [pJid] }).catch(() => {});
          }
        }
      } catch(_) {}
    }

    // ── ANTIRAID [FIX] handler manquant — détecte les entrées massives ──────
    if (action === 'add') {
      try {
        const raidSettings = database.getGroupSettings(id);
        if (raidSettings?.antiraid) {
          const { handleAntiraid } = require('./commands/group_management/antiraid');
          await handleAntiraid(sock, id, participants, raidSettings);
        }
      } catch(_) {}
    }
    // ───────────────────────────────────────────────────────────────────────

    const groupSettings = database.getGroupSettings(id);
    if (!groupSettings.welcome && !groupSettings.goodbye) return;
    if (groupSettings.isMuted) return;
    const groupMetadata = await getGroupMetadata(sock, id);
    if (!groupMetadata) return;
    const timeString = new Date().toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Ouagadougou', hour: '2-digit', minute: '2-digit'
    });
    for (const participant of participants) {
      const participantJid = (
        participant?.id || participant?.jid ||
        participant?.participant ||
        (typeof participant === 'string' ? participant : null)
      );
      if (!participantJid) continue;
      const participantNumber = participantJid.split('@')[0];
      // [PERF FIX] profilePictureUrl avec timeout 5s pour ne pas bloquer
      let profilePicUrl = 'https://files.catbox.moe/k37u59.png';
      try {
        profilePicUrl = await Promise.race([
          sock.profilePictureUrl(participantJid, 'image'),
          new Promise((_, r) => setTimeout(() => r(new Error('pp_timeout')), 5000))
        ]);
      } catch (_) {}

      if (action === 'add' && groupSettings.welcome) {
        const { getCustomEventMessage } = require('./commands/group_management/custommenu');
        const customMsg = getCustomEventMessage(id, 'welcome', {
          nom: participantNumber, numero: participantNumber,
          groupe: groupMetadata.subject || '', total: groupMetadata.participants.length,
        });
        const welcomeMsg = customMsg || `┌─「 THE BIG DIPPER // ESCOUADE 」\n│ Nouvelle recrue : @${participantNumber}\n│ Effectif : ${groupMetadata.participants.length}\n│ Heure : ${timeString}\n› Tu rejoins le clan. Discipline et loyauté sont exigées.\n└─ Bienvenue, soldat.`;
        // [PERF] axios.get avec timeout 8s
        try {
          const img = await axios.get(profilePicUrl, { responseType: 'arraybuffer', timeout: 8000 });
          await sock.sendMessage(id, {
            image: Buffer.from(img.data), caption: welcomeMsg, mentions: [participantJid]
          });
        } catch (_) {
          await sock.sendMessage(id, { text: welcomeMsg, mentions: [participantJid] });
        }

      } else if (action === 'remove' && groupSettings.goodbye) {
        const { getCustomEventMessage } = require('./commands/group_management/custommenu');
        const customMsg = getCustomEventMessage(id, 'goodbye', {
          nom: participantNumber, numero: participantNumber,
          groupe: groupMetadata.subject || '', total: groupMetadata.participants.length,
        });
        const goodbyeMsg = customMsg ||
          `┌─「 THE BIG DIPPER // ESCOUADE 」\n` +
          `│ Départ : @${participantNumber}\n` +
          `│ Effectif restant : ${groupMetadata.participants.length}\n` +
          `│ Heure : ${timeString}\n` +
          `› Un rang de moins dans nos rangs.\n` +
          `└─»»» Le clan continue sa marche.`;
        // [PERF] axios.get avec timeout 8s
        try {
          const img = await axios.get(profilePicUrl, { responseType: 'arraybuffer', timeout: 8000 });
          await sock.sendMessage(id, {
            image: Buffer.from(img.data), caption: goodbyeMsg, mentions: [participantJid]
          });
        } catch (_) {
          await sock.sendMessage(id, { text: goodbyeMsg, mentions: [participantJid] });
        }
      }
    }
  } catch (error) {
    if (error.message?.includes('403')) return;
    console.error('Erreur GroupUpdate:', error);
  }
};

// ==========================================
// ANTI-LINK
// [FIX 8] : pattern URL étendu (WhatsApp channels, Telegram, etc.)
// ==========================================
const handleAntilink = async (sock, msg, groupMetadata) => {
  try {
    const from   = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antilink) return;

    const body = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption || ''
    );

    // Pattern URL — inclut t.me, wa.me, whatsapp.com/channel, bit.ly, etc.
    const linkPattern = /(https?:\/\/|www\.)([a-zA-Z0-9][a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;
    if (!linkPattern.test(body)) return;

    // Exemptions hiérarchie
    if (isAnyOwner(sender) || isSudoUser(sender)) return;
    if (await isAdmin(sock, sender, from, groupMetadata)) return;
    if (isAllowedUser(sender, groupSettings)) return; // Liste blanche (.allow)

    const botAdmin = await isBotAdmin(sock, from);
    const action   = (groupSettings.antilinkAction || 'delete').toLowerCase();

    console.log(`[antilink] Lien détecté — sender:${sender} botAdmin:${botAdmin} action:${action}`);

    // ── Étape 1 : Suppression du message ─────────────────────────────
    // [FIX] Reconstruire la clé correctement pour Baileys v6
    // msg.key.participant peut être undefined ou mal formé dans certains cas
    // On force la reconstruction complète avec tous les champs requis
    if (botAdmin) {
      const deleteKey = {
        remoteJid  : from,
        id         : msg.key.id,
        fromMe     : false,
        // [FIX BAILEYS v6] participant est obligatoire pour supprimer
        // un message d'un autre utilisateur dans un groupe
        participant: sender,
      };
      try {
        await sock.sendMessage(from, { delete: deleteKey });
        console.log(`[antilink] ✅ Message supprimé — id:${msg.key.id}`);
      } catch (delErr) {
        console.error(`[antilink] ❌ Suppression échouée : ${delErr.message}`);
        // Tentative alternative avec la clé originale
        try {
          await sock.sendMessage(from, { delete: msg.key });
          console.log(`[antilink] ✅ Message supprimé (fallback clé originale)`);
        } catch (delErr2) {
          console.error(`[antilink] ❌ Suppression fallback échouée : ${delErr2.message}`);
        }
      }
    } else {
      console.warn(`[antilink] ⚠️ Bot pas admin — suppression impossible`);
    }

    // ── Étape 2 : Message de mention (sauf si kick) ───────────────────
    // Envoyé APRÈS la suppression pour que l'avertissement arrive
    // après que le lien soit déjà supprimé
    if (action !== 'kick') {
      const senderNum   = sender.split('@')[0].split(':')[0];
      const antilinkMsg =
        `@${senderNum}, les liens ne sont pas autorisés dans ce groupe.\n\n` +
        `Ce groupe est réservé aux discussions. Merci de ta compréhension.`;

      await sock.sendMessage(from, {
        text    : antilinkMsg,
        mentions: [sender],
      }).catch(e => console.error(`[antilink] ❌ Mention échouée : ${e.message}`));
    }

    // ── Étape 3 : Expulsion si configurée ────────────────────────────
    if (action === 'kick' && botAdmin) {
      try {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        console.log(`[antilink] ✅ Membre expulsé : ${sender}`);
      } catch (kickErr) {
        console.error(`[antilink] ❌ Expulsion échouée : ${kickErr.message}`);
      }
    }

  } catch (err) {
    console.error(`[antilink] ❌ Erreur globale : ${err.message}\n${err.stack}`);
  }
};

// ==========================================
// AI MODERATOR — Détection spam/insultes/flood
// Réutilise detectSpam/detectInsult/detectFlood déjà définis dans
// commands/group_management/aimoderator.js (aucune logique dupliquée)
// ==========================================
const handleAiModerator = async (sock, msg, groupMetadata) => {
  try {
    const from   = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.aiModerator) return;

    // Exemptions hiérarchie — jamais modérer owner/sudo/admin
    if (isAnyOwner(sender) || isSudoUser(sender)) return;
    if (await isAdmin(sock, sender, from, groupMetadata)) return;
    if (isAllowedUser(sender, groupSettings)) return; // Liste blanche (.allow)

    const body = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption || ''
    );
    if (!body) return;

    const { detectSpam, detectInsult, detectFlood } = require('./commands/group_management/aimoderator');

    const isSpam   = detectSpam(body);
    const isInsult = detectInsult(body);
    const isFlood  = detectFlood(sender, from);

    if (!isSpam && !isInsult && !isFlood) return;

    const reason = isSpam ? 'spam' : isInsult ? 'insulte' : 'flood';
    console.log(`[aimoderator] ${reason} détecté — sender:${sender}`);

    const botAdmin = await isBotAdmin(sock, from);

    // Suppression du message pour spam/insulte (le flood n'a pas un message
    // unique "coupable" à supprimer, on se contente d'avertir)
    if (botAdmin && (isSpam || isInsult)) {
      const deleteKey = {
        remoteJid  : from,
        id         : msg.key.id,
        fromMe     : false,
        participant: sender,
      };
      try {
        await sock.sendMessage(from, { delete: deleteKey });
        console.log(`[aimoderator] ✅ Message supprimé — id:${msg.key.id}`);
      } catch (delErr) {
        console.error(`[aimoderator] ❌ Suppression échouée : ${delErr.message}`);
      }
    }

    const senderNum    = sender.split('@')[0].split(':')[0];
    const reasonLabel  = isSpam ? 'un contenu de type spam'
                        : isInsult ? 'un langage insultant'
                        : 'un flood (trop de messages rapprochés)';

    await sock.sendMessage(from, {
      text: `⚠️ @${senderNum}, ton message a été modéré automatiquement (${reasonLabel}). Merci de respecter les règles du groupe.`,
      mentions: [sender],
    }).catch(e => console.error(`[aimoderator] ❌ Avertissement échoué : ${e.message}`));

  } catch (err) {
    console.error(`[aimoderator] ❌ Erreur globale : ${err.message}\n${err.stack}`);
  }
};

// ==========================================
// ANTI-GROUP MENTION
// ==========================================
const handleAntigroupmention = async (sock, msg, groupMetadata) => {
  try {
    const from   = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antigroupmention) return;
    const isForwardedStatus =
      !!msg.message?.groupStatusMentionMessage ||
      msg.message?.protocolMessage?.type === 25 ||
      !!msg.message?.extendedTextMessage?.contextInfo?.forwardedNewsletterMessageInfo ||
      !!msg.message?.contextInfo?.isForwarded;
    if (!isForwardedStatus) return;
    if (isAnyOwner(sender) || isSudoUser(sender)) return;
    if (await isAdmin(sock, sender, from, groupMetadata)) return;
    if (isAllowedUser(sender, groupSettings)) return; // Liste blanche (.allow)
    const botAdmin = await isBotAdmin(sock, from);
    await sock.sendMessage(from, { delete: msg.key });
    if ((groupSettings.antigroupmentionAction || 'delete').toLowerCase() === 'kick' && botAdmin)
      await sock.groupParticipantsUpdate(from, [sender], 'remove');
  } catch (_) {}
};

// ==========================================
// ANTI-CALL
// ==========================================
const initializeAntiCall = (sock) => {
  sock.ev.on('call', async (calls) => {
    try {
      if (!config.defaultGroupSettings?.anticall) return;
      for (const call of calls) {
        if (call.status === 'offer') {
          await sock.rejectCall(call.id, call.from);
          await sock.updateBlockStatus(call.from, 'block');
          await sock.sendMessage(call.from, {
            text: `𝐃𝐈𝐏𝐏𝐄𝐑  ɴᴇ ʀᴇ́ᴘᴏɴᴅ ǫᴜ'ᴀᴜx ᴍᴇssᴀɢᴇs ᴇ́ᴄʀɪᴛs.`
          });
        }
      }
    } catch (_) {}
  });
};

// ==========================================
// ANTI STATUS MENTION HANDLER [FIX] — Manquant dans le handler d'origine
// Détecte les messages qui contiennent une contextInfo avec statusMentionedJid
// ou des mentions via les statuts WhatsApp
// ==========================================
const handleAntistatusmention = async (sock, msg, groupMetadata) => {
  try {
    const groupId      = msg.key.remoteJid;
    const groupSettings = database.getGroupSettings(groupId);
    if (!groupSettings?.antistatusmention) return;

    // Détecter les mentions de statut dans contextInfo
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo ||
                    msg.message?.imageMessage?.contextInfo         ||
                    msg.message?.videoMessage?.contextInfo         ||
                    msg.message?.audioMessage?.contextInfo         ||
                    msg.message?.documentMessage?.contextInfo      || {};

    // Une mention de statut a : stanzaId présent ET remoteJid = 'status@broadcast'
    const isStatusMention =
      ctxInfo?.remoteJid === 'status@broadcast' ||
      ctxInfo?.mentionedJid?.some?.(j => j === 'status@broadcast');

    if (!isStatusMention) return;

    const sender = msg.key.participant || msg.key.remoteJid;
    if (!sender) return;

    // Exempter les owners et sudo
    if (isAnyOwner(sender) || isSudoUser(sender)) return;
    if (isAllowedUser(sender, groupSettings)) return; // Liste blanche (.allow)

    const botAdmin = await isBotAdmin(sock, groupId);
    const action   = (groupSettings.antistatusmentionAction || 'delete').toLowerCase();

    // Supprimer le message
    try {
      await sock.sendMessage(groupId, { delete: msg.key });
    } catch (_) {}

    if (action === 'kick' && botAdmin) {
      try {
        await sock.groupParticipantsUpdate(groupId, [sender], 'remove');
      } catch (_) {}
    }

    console.log(`[AntiStatusMention] ✅ Message statut supprimé dans ${groupId} — sender: ${sender}`);
  } catch (err) {
    console.error('[AntiStatusMention] error:', err.message);
  }
};

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  handleMessage,
  handleGroupUpdate,
  handleAntilink,
  handleAntigroupmention,
  handleAntistatusmention, // [FIX] ajouté
  initializeAntiCall,
  isSupremeOwner,
  isOwner,
  isAnyOwner,
  isSudoUser,
  isAdmin,
  isBotAdmin,
  isMod,
  getGroupMetadata,
  findParticipant,
  SUPREME_OWNER_LIDS,
  SUDO_BLOCKED_CATEGORY,
  // [PERF] Permet aux commandes d'invalider le cache arCfg
  invalidateArCfgCache,
  // [FIX KICKALL] Permet aux commandes d'invalider le cache metadata groupe
  invalidateGroupMetadataCache,
};
