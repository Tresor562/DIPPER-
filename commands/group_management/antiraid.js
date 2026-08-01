/**
 * Anti-Raid Command - THE BIG DIPPER
 * Protection contre les raids massifs de nouveaux membres.
 *
 * FONCTIONNEMENT :
 *   - Détecte N membres rejoignant en moins de X secondes
 *   - Actions possibles : kick, lock (ferme les inscriptions)
 *   - Seuil configurable : antiraid set <membres> <secondes>
 *   - Le handler antiraid est appelé depuis handler.js sur l'événement
 *     group-participants.update (action 'add')
 */

const database = require('../../database');
const config   = require('../../config.js');
const prefix   = config.prefix || '.';

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => { const i = n.indexOf(c); return i !== -1 ? s[i] : c; }).join('');
}

// Fenêtre temporelle par groupe pour détecter les raids
// { groupId: [timestamp, timestamp, ...] }
const raidWindows = {};

/**
 * Enregistre une entrée et retourne true si un raid est détecté.
 * Appelé depuis handler.js sur l'événement group-participants.update
 * [FIX] Compte le nombre réel de participants du batch (participantCount),
 * et non 1 par appel — un ajout groupé de 20 membres en un seul événement
 * Baileys doit compter comme 20, pas comme 1.
 *
 * Note sur la mémoire : chaque tableau raidWindows[groupId] est déjà
 * auto-limité (filtré à chaque appel, réinitialisé après détection d'un
 * raid) — sa taille ne peut pas croître sans borne. Seule la clé elle-même
 * persiste par groupe déjà visité, avec un coût négligeable (quelques
 * dizaines d'octets), ce qui ne justifie pas un timer de nettoyage global.
 */
function recordJoin(groupId, settings, participantCount = 1) {
  const threshold  = settings.antiraidThreshold  || 5;   // membres
  const windowSec  = settings.antiraidWindow      || 30;  // secondes
  const now        = Date.now();

  if (!raidWindows[groupId]) raidWindows[groupId] = [];

  // Nettoyer les anciennes entrées hors fenêtre
  raidWindows[groupId] = raidWindows[groupId].filter(t => (now - t) < windowSec * 1000);
  for (let i = 0; i < participantCount; i++) raidWindows[groupId].push(now);

  return raidWindows[groupId].length >= threshold;
}

/**
 * Handler principal appelé depuis handler.js sur group-participants.update
 * Exporté pour être utilisé directement dans l'event handler.
 */
async function handleAntiraid(sock, groupId, participants, settings) {
  try {
    if (!settings?.antiraid) return;

    const isRaid = recordJoin(groupId, settings, participants.length);
    if (!isRaid) return;

    // Reset la fenêtre après détection pour éviter les boucles
    raidWindows[groupId] = [];

    const action = (settings.antiraidAction || 'kick').toLowerCase();
    console.log(`[AntiRaid] 🚨 Raid détecté dans ${groupId} — action: ${action}`);

    if (action === 'lock') {
      // Fermer les inscriptions du groupe
      try {
        await sock.groupSettingUpdate(groupId, 'announcement');
        await sock.sendMessage(groupId, {
          text:
            `🚨 *╭━≪• ᴀɴᴛɪ-ʀᴀɪᴅ ᴅᴇ́ᴄʟᴇɴᴄʜᴇ́ •≫━╾╮*\n` +
            `*┃* 🔒 ${toSC('groupe verrouille — raid detecte')}\n` +
            `*┃* 🛡️ ${toSC('inscriptions fermees automatiquement')}\n` +
            `╰━━━━━━━━━━━━━━━━━╯`
        });
      } catch (e) {
        console.error('[AntiRaid] lock error:', e.message);
      }
    } else if (action === 'kick') {
      // Exclure les nouveaux participants du raid
      for (const jid of participants) {
        try {
          await sock.groupParticipantsUpdate(groupId, [jid], 'remove');
          await new Promise(r => setTimeout(r, 800)); // délai anti-rate-limit
        } catch (e) {
          console.error(`[AntiRaid] kick ${jid} error:`, e.message);
        }
      }
      await sock.sendMessage(groupId, {
        text:
          `🚨 *╭━≪• ᴀɴᴛɪ-ʀᴀɪᴅ ᴅᴇ́ᴄʟᴇɴᴄʜᴇ́ •≫━╾╮*\n` +
          `*┃* ⚡ ${toSC('raid detecte et bloque')}\n` +
          `*┃* 🛡️ ${participants.length} ${toSC('intrus exclus du sanctuaire')}\n` +
          `╰━━━━━━━━━━━━━━━━━╯`
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[AntiRaid] handleAntiraid error:', err.message);
  }
}

module.exports = {
  name: 'antiraid',
  aliases: ['antiraids', 'raidprotect', 'raidguard'],
  category: '🛡️ Protections',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ ᴀɴᴛɪ-ʀᴀɪᴅ ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇ',
  usage: `${prefix}antiraid <on/off/set/get>`,
  groupOnly: true,
  adminOnly: false,
  botAdminNeeded: true,

  // Exporte aussi le handler pour handler.js
  handleAntiraid,

  async execute(sock, msg, args, extra) {
    const { reply, isAdmin, isOwner, from, phrases } = extra;

    try {
      if (!isOwner && !isAdmin) {
        return reply(
          `*❌ ${toSC('incantation reservee aux administrateurs du sanctuaire')} !*\n\n${phrases.footer()}`
        );
      }

      if (!args[0]) {
        const s         = database.getGroupSettings(from);
        const status    = s.antiraid ? '🟢 ᴏɴ' : '🔴 ᴏꜰꜰ';
        const action    = (s.antiraidAction    || 'kick').toUpperCase();
        const threshold = s.antiraidThreshold  || 5;
        const window    = s.antiraidWindow     || 30;

        return reply(
          `*╭━≪• 🚨 ${toSC('bouclier anti-raid')} •≫╾╮*\n` +
          `*┃* 📊 *${toSC('etat')}* : ${status}\n` +
          `*┃* ⚡ *${toSC('seuil')}* : ${threshold} ${toSC('membres en')} ${window}s\n` +
          `*┃* ⚖️ *${toSC('action')}* : ${action}\n` +
          `*┃*\n` +
          `*┃* 🔮 *${toSC('usage')}* :\n` +
          `*┃*   \`${prefix}antiraid on\`\n` +
          `*┃*   \`${prefix}antiraid off\`\n` +
          `*┃*   \`${prefix}antiraid set <membres> <secondes>\`\n` +
          `*┃*   \`${prefix}antiraid action kick | lock\`\n` +
          `*┃*   \`${prefix}antiraid get\`\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      const opt = args[0].toLowerCase();

      if (opt === 'on') {
        database.updateGroupSettings(from, { antiraid: true });
        return reply(`*🚨 ${toSC('bouclier anti-raid active')} (ᴏɴ).*\n\n${phrases.footer()}`);
      }

      if (opt === 'off') {
        database.updateGroupSettings(from, { antiraid: false });
        return reply(`*🔓 ${toSC('bouclier anti-raid desactive')} (ᴏꜰꜰ).*\n\n${phrases.footer()}`);
      }

      if (opt === 'set') {
        const threshold = parseInt(args[1]) || 5;
        const window    = parseInt(args[2]) || 30;
        if (threshold < 2 || threshold > 50) {
          return reply(`*❓ ${toSC('seuil doit etre entre 2 et 50 membres')}.*\n\n${phrases.footer()}`);
        }
        if (window < 5 || window > 300) {
          return reply(`*❓ ${toSC('fenetre doit etre entre 5 et 300 secondes')}.*\n\n${phrases.footer()}`);
        }
        database.updateGroupSettings(from, { antiraidThreshold: threshold, antiraidWindow: window, antiraid: true });
        return reply(
          `*⚙️ ${toSC('anti-raid configure')} :*\n` +
          `*┃* ⚡ ${toSC('seuil')} : ${threshold} ${toSC('membres')}\n` +
          `*┃* ⏱️ ${toSC('fenetre')} : ${window}s\n\n${phrases.footer()}`
        );
      }

      if (opt === 'action') {
        const act = (args[1] || '').toLowerCase();
        if (!['kick', 'lock'].includes(act)) {
          return reply(`*❓ ${toSC('action invalide')} — kick | lock\n\n${phrases.footer()}`);
        }
        database.updateGroupSettings(from, { antiraidAction: act });
        return reply(`*⚖️ ${toSC('action anti-raid definie sur')} : ${act.toUpperCase()}*\n\n${phrases.footer()}`);
      }

      if (opt === 'get') {
        const s         = database.getGroupSettings(from);
        const status    = s.antiraid ? '🟢 ᴏɴ' : '🔴 ᴏꜰꜰ';
        const action    = (s.antiraidAction    || 'kick').toUpperCase();
        const threshold = s.antiraidThreshold  || 5;
        const window    = s.antiraidWindow     || 30;
        return reply(
          `*╭━≪• 🚨 ${toSC('anti-raid statut')} •≫╾╮*\n` +
          `*┃* 📊 ${toSC('etat')} : ${status}\n` +
          `*┃* ⚡ ${toSC('seuil')} : ${threshold}/${window}s\n` +
          `*┃* ⚖️ ${toSC('action')} : ${action}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
        );
      }

      return reply(`*💡 ${toSC('utilise')} \`${prefix}antiraid\` ${toSC('pour voir les options')}.*\n\n${phrases.footer()}`);

    } catch (err) {
      console.error('[antiraid] error:', err.message);
      await reply(`*❌ ᴇʀʀᴇᴜʀ :* ${err.message}\n\n${phrases.footer()}`).catch(() => {});
    }
  }
};
