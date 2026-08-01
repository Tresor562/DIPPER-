/**
 * Obfuscate Command — 𝐃𝐚𝐫𝐤 Edition
 * ─────────────────────────────────────
 * .obfuscate <code JS>  [OWNER ONLY]
 * Obfusque / minifie du code JavaScript via javascript-obfuscator (npm)
 * ou via l'API obfuscator.io si le module n'est pas installé.
 *
 * SÉCURITÉ : ownerOnly — risque d'abus (exécution arbitraire de code).
 * Le code est obfusqué UNIQUEMENT, jamais exécuté par le bot.
 */
const config  = require('../../config.js');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

/**
 * Obfuscation locale via javascript-obfuscator (si installé)
 */
async function obfuscateLocal(code) {
  try {
    const JO = require('javascript-obfuscator');
    const result = JO.obfuscate(code, {
      compact              : true,
      controlFlowFlattening: true,
      deadCodeInjection    : true,
      stringArrayEncoding  : ['base64'],
      identifierNamesGenerator: 'hexadecimal',
      rotateStringArray    : true,
      selfDefending        : false, // évite les boucles infinies
    });
    return result.getObfuscatedCode();
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return null; // non installé
    throw e;
  }
}

/**
 * Obfuscation via l'API publique obfuscator.io
 */
async function obfuscateApi(code) {
  const axios = require('axios');
  const res   = await axios.post('https://api.obfuscator.io/obfuscate', {
    source   : code,
    options  : { compact: true, controlFlowFlattening: true },
  }, { timeout: 15000, headers: { 'Content-Type': 'application/json' } });
  if (res.data?.error) throw new Error(res.data.error);
  return res.data?.code || res.data?.source;
}

/**
 * Minification basique (fallback ultime) sans dépendance externe
 */
function minifyBasic(code) {
  return code
    .replace(/\/\/[^\n]*/g, '')          // supprimer commentaires ligne
    .replace(/\/\*[\s\S]*?\*\//g, '')    // supprimer commentaires blocs
    .replace(/\s+/g, ' ')               // réduire espaces
    .replace(/\s*([\{\}\(\)\[\];,=:+\-*/<>!&|?])\s*/g, '$1') // compacter ops
    .trim();
}

module.exports = {
  name:'obfuscate', aliases:['obfusquer','minify','jsminify','jsobs'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴏʙꜰᴜsǫᴜᴇ ᴅᴜ ᴄᴏᴅᴇ JavaScript [👑 ᴏᴡɴᴇʀ]',
  usage:`${config.prefix||'.'}obfuscate <code>`,
  ownerOnly: true, // ← SÉCURITÉ : accès propriétaire uniquement

  async execute(sock, msg, args, extra) {
    const { reply, from, isOwner, phrases } = extra;

    // ── Guard owner ───────────────────────────────────────
    if (!isOwner) {
      return reply(
        `*🔒 ${SC('commande réservée au propriétaire du bot')}*\n\n${phrases.footer()}`
      );
    }

    // ── Récupération du code ──────────────────────────────
    let code = args.join(' ');

    // Si c'est une réponse à un message texte
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (!code && ctx?.quotedMessage?.conversation) {
      code = ctx.quotedMessage.conversation;
    }

    if (!code.trim()) {
      return reply(
        `*📌 ᴜsᴀɢᴇ :* \`${config.prefix||'.'}obfuscate <code js>\`\n` +
        `_ᴏᴜ ʀᴇ́ᴘᴏɴᴅs ᴀ̀ ᴜɴ ᴍᴇssᴀɢᴇ ᴄᴏɴᴛᴇɴᴀɴᴛ ᴅᴜ ᴄᴏᴅᴇ_\n\n${phrases.footer()}`
      );
    }

    // ── Limite anti-abus ──────────────────────────────────
    if (code.length > 50000) {
      return reply(`*⚠️ ${SC('code trop long')} (max 50 000 caractères)*\n\n${phrases.footer()}`);
    }

    await sock.sendMessage(from, { react: { text: '⚙️', key: msg.key } }).catch(()=>{});

    try {
      let obfuscated = await obfuscateLocal(code);
      let method     = 'javascript-obfuscator';

      if (!obfuscated) {
        try {
          obfuscated = await obfuscateApi(code);
          method     = 'obfuscator.io';
        } catch (_) {
          obfuscated = minifyBasic(code);
          method     = 'minification locale';
        }
      }

      if (!obfuscated) throw new Error('Obfuscation échouée sur toutes les méthodes');

      const preview = obfuscated.slice(0, 300) + (obfuscated.length > 300 ? '…' : '');

      const header =
        `╭╼≪• *⚙️ ${SC('code obfusqué')}* •≫╾╮\n` +
        `┃ 📏 *${SC('original')}* : ${code.length} chars\n` +
        `┃ 🔐 *${SC('obfusqué')}* : ${obfuscated.length} chars\n` +
        `┃ 🛠️ *${SC('méthode')}* : ${method}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n`;

      // Envoyer via document texte si trop long
      if (obfuscated.length > 3000) {
        const fs   = require('fs');
        const os   = require('os');
        const path = require('path');
        const tmp  = path.join(os.tmpdir(), `obfuscated_${Date.now()}.js`);
        fs.writeFileSync(tmp, obfuscated, 'utf8');
        await sock.sendMessage(from, {
          document: fs.readFileSync(tmp),
          mimetype: 'text/javascript',
          fileName: 'obfuscated.js',
          caption : header + phrases.footer(),
        }, { quoted: msg });
        fs.unlink(tmp, ()=>{});
      } else {
        await reply(`${header}\`\`\`${preview}\`\`\`\n\n${phrases.footer()}`);
      }

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('erreur dobfuscation')} :* _${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
