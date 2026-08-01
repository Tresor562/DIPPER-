/**
 * Antipurge Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * Surveille automatiquement les expulsions
 * Réintègre 2 à 2 toutes les 30 minutes
 * FIX: extra n'était pas disponible dans reintegrerPaire (hors execute)
 */

const config = require('../../config');
const prefix = config.prefix || '.';
const fs     = require('fs');
const path   = require('path');

const PURGE_FILE = path.join(process.cwd(), 'utils', 'antipurge_queue.json');
const WATCH_FILE = path.join(process.cwd(), 'utils', 'antipurge_watch.json');

const timersActifs = {};

function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {}
  return {};
}

function saveJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

// Footer statique utilisé hors contexte execute
const FOOTER_STATIC = `> *𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́*`;

function enregistrerExpulses(groupId, participants) {
  const watch = loadJSON(WATCH_FILE);
  if (!watch[groupId]) return;

  const queue = loadJSON(PURGE_FILE);
  if (!queue[groupId]) queue[groupId] = { membres: [], restants: 0 };

  const jids = participants.map(p =>
    typeof p === 'string' ? p : (p?.id || p?.jid || '')
  ).filter(j => j && j.endsWith('@s.whatsapp.net'));

  for (const jid of jids) {
    if (!queue[groupId].membres.includes(jid)) {
      queue[groupId].membres.push(jid);
    }
  }

  queue[groupId].restants = queue[groupId].membres.length;
  saveJSON(PURGE_FILE, queue);
  console.log(`📋 Antipurge — ${jids.length} expulsé(s) enregistré(s) dans ${groupId}`);
}

async function getLienGroupe(sock, groupId) {
  try {
    const code = await sock.groupInviteCode(groupId);
    return `https://chat.whatsapp.com/${code}`;
  } catch (_) {
    return null;
  }
}

// FIX: footer passé en paramètre au lieu de extra.phrases.footer()
async function reintegrerPaire(sock, groupId, notifJid, footer) {
  const footerText = footer || FOOTER_STATIC;
  const queue = loadJSON(PURGE_FILE);
  const gData = queue[groupId];

  if (!gData || !gData.membres || gData.membres.length === 0) {
    delete queue[groupId];
    saveJSON(PURGE_FILE, queue);
    delete timersActifs[groupId];

    try {
      await sock.sendMessage(notifJid || groupId, {
        text:
          `╭━≪• *✅ ᴀɴᴛɪᴘᴜʀɢᴇ ᴛᴇʀᴍɪɴᴇ́* •≫━╾╮\n` +
          `┃ 🎉 ᴛᴏᴜs ʟᴇs ᴍᴇᴍʙʀᴇs\n` +
          `┃    ᴏɴᴛ ᴇ́ᴛᴇ́ ʀᴇ́ɪɴᴛᴇ́ɢʀᴇ́s !\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${footerText}`
      });
    } catch (_) {}
    return;
  }

  const paire = gData.membres.splice(0, 2);
  queue[groupId].restants = gData.membres.length;
  saveJSON(PURGE_FILE, queue);

  const lien = await getLienGroupe(sock, groupId);

  try {
    await sock.groupParticipantsUpdate(groupId, paire, 'add');
  } catch (_) {}

  for (const jid of paire) {
    try {
      const numero = jid.split('@')[0];
      const msgExcuse =
        `╭━≪• *🙏 ᴍᴇssᴀɢᴇ ᴅᴜ sᴀɴᴄᴛᴜᴀɪʀᴇ* •≫━╾╮\n` +
        `┃\n` +
        `┃ ʙᴏɴᴊᴏᴜʀ @${numero} 👋\n` +
        `┃\n` +
        `┃ ɴᴏᴜs ᴛᴇ ᴘʀᴇ́sᴇɴᴛᴏɴs ɴᴏs\n` +
        `┃ sɪɴᴄᴇ̀ʀᴇs ᴇxᴄᴜsᴇs ᴘᴏᴜʀ\n` +
        `┃ ᴛᴏɴ ᴇxᴘᴜʟsɪᴏɴ ɪɴᴀᴛᴛᴇɴᴅᴜᴇ.\n` +
        `┃\n` +
        `┃ ᴄ'ᴇ́ᴛᴀɪᴛ ᴜɴᴇ ᴇʀʀᴇᴜʀ ᴇᴛ\n` +
        `┃ ᴛᴜ ᴇs ʟᴇ/ʟᴀ ʙɪᴇɴᴠᴇɴᴜ(ᴇ)\n` +
        `┃ ᴀ̀ ʀᴇᴠᴇɴɪʀ ᴘᴀʀᴍɪ ɴᴏᴜs. 🖤\n` +
        `┃\n` +
        (lien ? `┃ 🔗 *ʀᴇᴊᴏɪɴs ʟᴇ sᴀɴᴄᴛᴜᴀɪʀᴇ :*\n┃ ${lien}\n┃\n` : '') +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${footerText}`;

      await sock.sendMessage(jid, { text: msgExcuse, mentions: [jid] });
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1500));
  }

  const restants = gData.membres.length;
  try {
    await sock.sendMessage(notifJid || groupId, {
      text:
        `⏳ *ᴀɴᴛɪᴘᴜʀɢᴇ — ᴘʀᴏɢʀᴇssɪᴏɴ*\n\n` +
        `✅ *ʀᴇ́ɪɴᴛᴇ́ɢʀᴇ́s* : ${paire.length}\n` +
        `⏳ *ʀᴇsᴛᴀɴᴛs* : ${restants}\n` +
        (restants > 0 ? `🕐 *ᴘʀᴏᴄʜᴀɪɴᴇ ᴠᴀɢᴜᴇ ᴅᴀɴs 30 ᴍɪɴᴜᴛᴇs*\n` : '') +
        `\n${footerText}`
    });
  } catch (_) {}

  if (restants > 0) {
    timersActifs[groupId] = setTimeout(() => {
      reintegrerPaire(sock, groupId, notifJid, footerText);
    }, 30 * 60 * 1000);
  } else {
    const q = loadJSON(PURGE_FILE);
    delete q[groupId];
    saveJSON(PURGE_FILE, q);
    delete timersActifs[groupId];

    try {
      await sock.sendMessage(notifJid || groupId, {
        text:
          `╭━≪• *✅ ᴀɴᴛɪᴘᴜʀɢᴇ ᴛᴇʀᴍɪɴᴇ́* •≫━╾╮\n` +
          `┃ 🎉 ᴛᴏᴜs ʀᴇ́ɪɴᴛᴇ́ɢʀᴇ́s !\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${footerText}`
      });
    } catch (_) {}
  }
}

module.exports = {
  name: 'antipurge',
  aliases: ['antikick', 'recuperer', 'reintegrer'],
  category: '🛡️ Protections',
  ownerOnly: false,
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇ́ɪɴᴛᴇ̀ɢʀᴇ ᴀᴜᴛᴏ ʟᴇs ᴍᴇᴍʙʀᴇs ᴇxᴘᴜʟsᴇ́s (2/30ᴍɪɴ)',
  usage: `${prefix}antipurge | ${prefix}antipurge stop | ${prefix}antipurge watch on/off`,

  enregistrerExpulses,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isAdmin, isBotAdmin, from, phrases } = extra;
    const footer = phrases.footer();

    if (!from.endsWith('@g.us')) {
      return reply(`*〆 ᴄᴏᴍᴍᴀɴᴅᴇ ᴜɴɪǫᴜᴇᴍᴇɴᴛ ᴅᴀɴs ᴜɴ ɢʀᴏᴜᴘᴇ !*\n\n${footer}`);
    }

    if (!isOwner && !isAdmin) {
      return reply(`*⛔ ᴛᴜ ᴅᴏɪs ᴇ̂ᴛʀᴇ ᴀᴅᴍɪɴ ᴏᴜ ᴏᴡɴᴇʀ ᴅᴜ ʙᴏᴛ*\n\n${footer}`);
    }

    if (!isBotAdmin) {
      return reply(`*⛔ ʟᴇ ʙᴏᴛ ᴅᴏɪᴛ ᴇ̂ᴛʀᴇ ᴀᴅᴍɪɴ ᴅᴜ ɢʀᴏᴜᴘᴇ !*\n\n${footer}`);
    }

    const action = (args[0] || '').toLowerCase();

    if (action === 'watch') {
      const etat  = (args[1] || '').toLowerCase();
      const watch = loadJSON(WATCH_FILE);

      if (etat === 'on') {
        watch[from] = true;
        saveJSON(WATCH_FILE, watch);
        return reply(
          `╭━≪• *👁️ sᴜʀᴠᴇɪʟʟᴀɴᴄᴇ ᴀᴄᴛɪᴠᴇ́ᴇ* •≫━╾╮\n` +
          `┃ ✅ ʟᴇ ʙᴏᴛ ᴇɴʀᴇɢɪsᴛʀᴇ\n` +
          `┃    ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇᴍᴇɴᴛ ᴛᴏᴜs\n` +
          `┃    ʟᴇs ᴍᴇᴍʙʀᴇs ᴇxᴘᴜʟsᴇ́s\n` +
          `┃ 📋 ᴛᴀᴘᴇ \`${prefix}antipurge\`\n` +
          `┃    ᴘᴏᴜʀ ʟᴀɴᴄᴇʀ ʟᴀ\n` +
          `┃    ʀᴇ́ɪɴᴛᴇ́ɢʀᴀᴛɪᴏɴ\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${footer}`
        );
      }

      if (etat === 'off') {
        delete watch[from];
        saveJSON(WATCH_FILE, watch);
        return reply(
          `╭━≪• *👁️ sᴜʀᴠᴇɪʟʟᴀɴᴄᴇ ᴅᴇ́sᴀᴄᴛɪᴠᴇ́ᴇ* •≫━╾╮\n` +
          `┃ 🔴 ʟᴇ ʙᴏᴛ ɴ'ᴇɴʀᴇɢɪsᴛʀᴇ\n` +
          `┃    ᴘʟᴜs ʟᴇs ᴇxᴘᴜʟsɪᴏɴs\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${footer}`
        );
      }

      return reply(
        `*📌 ᴜsᴀɢᴇ :*\n` +
        `\`${prefix}antipurge watch on\` — ᴀᴄᴛɪᴠᴇʀ\n` +
        `\`${prefix}antipurge watch off\` — ᴅᴇ́sᴀᴄᴛɪᴠᴇʀ`
      );
    }

    if (action === 'stop') {
      if (timersActifs[from]) {
        clearTimeout(timersActifs[from]);
        delete timersActifs[from];
      }
      const queue = loadJSON(PURGE_FILE);
      delete queue[from];
      saveJSON(PURGE_FILE, queue);
      return reply(
        `╭━≪• *🔴 ᴀɴᴛɪᴘᴜʀɢᴇ ᴀʀʀᴇ̂ᴛᴇ́* •≫━╾╮\n` +
        `┃ ⏹️ ꜰɪʟᴇ ᴅ'ᴀᴛᴛᴇɴᴛᴇ ᴠɪᴅᴇ́ᴇ\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${footer}`
      );
    }

    if (action === 'liste' || action === 'list') {
      const queue = loadJSON(PURGE_FILE);
      const gData = queue[from];
      if (!gData || gData.membres.length === 0) {
        return reply(
          `*📋 ᴀᴜᴄᴜɴ ᴍᴇᴍʙʀᴇ ᴇɴʀᴇɢɪsᴛʀᴇ́*\n\n` +
          `_ᴀᴄᴛɪᴠᴇ ʟᴀ sᴜʀᴠᴇɪʟʟᴀɴᴄᴇ :_\n` +
          `\`${prefix}antipurge watch on\`\n\n${footer}`
        );
      }
      const liste = gData.membres.map((j, i) => `${i+1}. +${j.split('@')[0]}`).join('\n');
      return reply(
        `*📋 ᴍᴇᴍʙʀᴇs ᴇɴʀᴇɢɪsᴛʀᴇ́s (${gData.membres.length}) :*\n\n${liste}\n\n` +
        `_ᴛᴀᴘᴇ \`${prefix}antipurge\` ᴘᴏᴜʀ ʟᴀɴᴄᴇʀ_\n\n${footer}`
      );
    }

    if (timersActifs[from]) {
      return reply(
        `*⚠️ ᴜɴ ᴀɴᴛɪᴘᴜʀɢᴇ ᴇsᴛ ᴅᴇ́ᴊᴀ̀ ᴇɴ ᴄᴏᴜʀs !*\n` +
        `\`${prefix}antipurge stop\` ᴘᴏᴜʀ ᴀʀʀᴇ̂ᴛᴇʀ\n\n${footer}`
      );
    }

    const queue = loadJSON(PURGE_FILE);
    const gData = queue[from];

    if (!gData || !gData.membres || gData.membres.length === 0) {
      const watch    = loadJSON(WATCH_FILE);
      const estActif = watch[from] === true;
      return reply(
        `╭━≪• *📋 ᴀɴᴛɪᴘᴜʀɢᴇ* •≫━╾╮\n` +
        `┃ 👁️ sᴜʀᴠᴇɪʟʟᴀɴᴄᴇ : ${estActif ? '🟢 ᴀᴄᴛɪᴠᴇ' : '🔴 ɪɴᴀᴄᴛɪᴠᴇ'}\n` +
        `┃ 👥 ᴇxᴘᴜʟsᴇ́s ᴇɴʀᴇɢ. : 0\n` +
        `┃\n` +
        `┃ ${estActif
            ? '📋 ᴇxᴘᴜʟsᴇ ᴅᴇs ᴍᴇᴍʙʀᴇs,\n┃    ʟᴇ ʙᴏᴛ ʟᴇs ᴇɴʀᴇɢɪsᴛʀᴇ\n┃    ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇᴍᴇɴᴛ.'
            : `ᴀᴄᴛɪᴠᴇ ᴅ'ᴀʙᴏʀᴅ :\n┃    \`${prefix}antipurge watch on\``}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${footer}`
      );
    }

    const notifJid = extra.sender || msg.key.participant || msg.key.remoteJid;

    await reply(
      `╭━≪• *🔄 ᴀɴᴛɪᴘᴜʀɢᴇ ᴅᴇ́ᴍᴀʀʀᴇ́* •≫━╾╮\n` +
      `┃ 👥 *ᴍᴇᴍʙʀᴇs* : ${gData.membres.length}\n` +
      `┃ ⏱️ *ʀʏᴛʜᴍᴇ* : 2 / 30 ᴍɪɴ\n` +
      `┃ 📨 *ᴇxᴄᴜsᴇs* : ᴀᴜᴛᴏᴍᴀᴛɪǫᴜᴇs\n` +
      `┃ 🔗 *ʟɪᴇɴ ɢʀᴏᴜᴘᴇ* : ɪɴᴄʟᴜs\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n${footer}`
    );

    await reintegrerPaire(sock, from, notifJid, footer);
  }
};
