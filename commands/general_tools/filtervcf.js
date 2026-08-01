/**
 * FilterVCF Command — 𝐃𝐚𝐫𝐤 Edition
 * ─────────────────────────────────────────────────
 * .filtervcf [préfixe]
 *  → Répond à un fichier VCF, filtre les contacts
 *    par préfixe de numéro (ex: 229 pour le Bénin)
 *    et renvoie un VCF nettoyé.
 *
 * .filtervcf (sans arg) → retire les doublons seulement
 *
 * Fonctionnement :
 *   1. Télécharge le VCF joint ou cité
 *   2. Parse chaque bloc BEGIN:VCARD ... END:VCARD
 *   3. Filtre selon le préfixe (indicatif pays ou opérateur)
 *   4. Déduplique par numéro normalisé
 *   5. Renvoie le VCF filtré en fichier
 */
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const config = require('../../config.js');

const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

/**
 * Parse un fichier VCF en tableau de blocs { name, phone, raw }
 */
function parseVcf(content) {
  const blocks  = content.split(/BEGIN:VCARD/i).slice(1);
  const contacts = [];

  for (const block of blocks) {
    const full  = 'BEGIN:VCARD\n' + block.trim();
    const name  = (block.match(/FN:([^\r\n]+)/i)?.[1] || 'Inconnu').trim();
    const phones = [];
    for (const m of block.matchAll(/TEL[^:]*:([^\r\n]+)/gi)) {
      const num = m[1].replace(/\s|-|\(|\)/g,'').trim();
      if (num) phones.push(num);
    }
    if (phones.length) {
      contacts.push({ name, phones, raw: full });
    }
  }
  return contacts;
}

/**
 * Normalise un numéro : retire le + et les espaces.
 */
function normalizePhone(p) { return p.replace(/\D/g,''); }

module.exports = {
  name:'filtervcf', aliases:['vcffilter','trivervcf','cleanvcf','filtrervcf'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴛʀɪᴇ ᴇᴛ ɴᴇᴛᴛᴏɪᴇ ᴜɴ ꜰɪᴄʜɪᴇʀ ᴄᴏɴᴛᴀᴄᴛs VCF',
  usage:`${config.prefix||'.'}filtervcf [préfixe] (répondre au VCF)`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;

    // ── Récupération du VCF ───────────────────────────────
    const ctx     = msg.message?.extendedTextMessage?.contextInfo;
    const quoted  = ctx?.quotedMessage;
    const docMsg  = msg.message?.documentMessage || quoted?.documentMessage;

    if (!docMsg) {
      return reply(
        `*📎 ${SC('réponds à un fichier VCF pour le filtrer')} !*\n` +
        `_ᴇx : \`${config.prefix||'.'}filtervcf 229\` (ɢᴀʀᴅᴇ ᴜɴɪǫᴜᴇᴍᴇɴᴛ ʟᴇs ɴᴜᴍᴇ́ʀᴏs +229)_\n\n${phrases.footer()}`
      );
    }

    const prefix_filter = args[0]?.replace(/\D/g,'') || null;

    await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } }).catch(()=>{});

    try {
      // Téléchargement du document
      const targetMsg = quoted
        ? { key: { remoteJid: from, id: ctx.stanzaId, participant: ctx.participant }, message: quoted }
        : msg;

      const buffer  = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
      const content = buffer.toString('utf8');

      // Parsing
      let contacts = parseVcf(content);
      const total  = contacts.length;

      // Filtrage par préfixe
      if (prefix_filter) {
        contacts = contacts.filter(c =>
          c.phones.some(p => normalizePhone(p).startsWith(prefix_filter))
        );
      }

      // Déduplication par numéro normalisé
      const seen = new Set();
      contacts = contacts.filter(c => {
        const key = normalizePhone(c.phones[0] || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (contacts.length === 0) {
        return reply(
          `*⚠️ ${SC('aucun contact trouvé')}*\n` +
          `_${prefix_filter ? `Aucun numéro commençant par +${prefix_filter}` : 'VCF vide ou invalide'}_\n\n${phrases.footer()}`
        );
      }

      // Reconstruction du VCF filtré
      const vcfContent  = contacts.map(c => c.raw).join('\n\n');
      const tmpFile     = path.join(os.tmpdir(), `dark_vcf_${Date.now()}.vcf`);
      fs.writeFileSync(tmpFile, vcfContent, 'utf8');

      await sock.sendMessage(from, {
        document: fs.readFileSync(tmpFile),
        mimetype: 'text/vcard',
        fileName: `contacts_filtres_${prefix_filter||'clean'}.vcf`,
        caption :
          `╭╼≪• *📋 ${SC('vcf filtré')}* •≫╾╮\n` +
          `┃\n` +
          `┃ 📂 *${SC('total original')}* : ${total}\n` +
          (prefix_filter ? `┃ 🔍 *${SC('préfixe')}* : +${prefix_filter}\n` : '') +
          `┃ ✅ *${SC('contacts gardés')}* : ${contacts.length}\n` +
          `┃ 🗑️ *${SC('supprimés/doublons')}* : ${total - contacts.length}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
      }, { quoted: msg });

      // Nettoyage du fichier temporaire
      fs.unlink(tmpFile, ()=>{});
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('erreur')} :* _${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
