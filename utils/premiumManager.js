/**
 * premiumManager.js — Alias de compatibilité pour premiumDB.js
 *
 * [FIX] handler.js et reply.js requièrent './utils/premiumManager'
 * mais le fichier réel est './utils/premiumDB'.
 * Ce fichier assure la compatibilité sans modifier tous les require().
 */
module.exports = require('./premiumDB');
