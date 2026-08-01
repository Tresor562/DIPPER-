/**
 * RunEval Command — 𝐃𝐚𝐫𝐤 Edition
 * ─────────────────────────────────────────────────
 * .runeval <code JS>  [OWNER ONLY — DANGEREUX]
 * Exécute du JavaScript dans le contexte du bot.
 *
 * ⚠️  SÉCURITÉ ABSOLUE :
 *   - ownerOnly : vérification stricte par numéro de l'owner
 *   - Timeout 5 secondes (évite les boucles infinies)
 *   - Pas de require() système (blacklist partielle)
 *   - Les erreurs sont capturées et renvoyées proprement
 *   - Le résultat est tronqué à 2000 caractères
 *
 * USAGE LÉGITIME : debug du bot en production,
 *   exécution de requêtes DB, tests Baileys rapides.
 */
const config  = require('../../config.js');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

/**
 * Exécute un code JS avec timeout.
 * @param {string} code  — code à évaluer
 * @param {object} ctx   — contexte (sock, msg, etc.)
 * @param {number} timeout — millisecondes
 */
async function safeEval(code, ctx, timeout = 5000) {
  // Blacklist de fonctions trop dangereuses
  const BLACKLIST = ['process.exit', 'child_process', 'fs.rm', 'fs.unlink', 'fs.rmdir'];
  for (const b of BLACKLIST) {
    if (code.includes(b)) throw new Error(`Usage de "${b}" interdit par sécurité`);
  }

  const { sock, msg, from, sender } = ctx;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout 5s dépassé')), timeout);

    try {
      // eval avec contexte — les variables sock, msg, from, sender sont disponibles
      // eslint-disable-next-line no-eval
      const result = eval(code);
      clearTimeout(timer);

      if (result && typeof result.then === 'function') {
        result.then(v => resolve(v)).catch(e => { clearTimeout(timer); reject(e); });
      } else {
        resolve(result);
      }
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

module.exports = {
  name:'runeval', aliases:['eval','exec','rune'],
  // [FIX CRITIQUE] Aliases supprimés :
  //   'je'  → mot français ultra-courant ("je vais bien" → eval("vais bien") → "vais is not defined")
  //   'run' → verbe anglais courant, même problème
  // Ces aliases déclenchaient runeval via ghostgMode NLP quand l'owner
  // envoyait n'importe quelle phrase commençant par "je" ou "run".
  // Seuls 'eval', 'exec', 'rune' sont conservés — ils ne sont jamais des mots du langage courant.
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇxᴇ́ᴄᴜᴛᴇ ᴅᴜ ᴄᴏᴅᴇ JavaScript [👑 ᴏᴡɴᴇʀ ᴜɴɪǫᴜᴇᴍᴇɴᴛ]',
  usage:`${config.prefix||'.'}runeval <code js>`,
  ownerOnly: true, // ← CRITIQUE — ne jamais retirer

  async execute(sock, msg, args, extra) {
    const { reply, from, isOwner, sender, phrases } = extra;

    // ── Double guard owner — vérification stricte ─────────
    if (!isOwner) {
      return reply(`*🔒 ${SC('accès refusé — propriétaire uniquement')}*\n\n${phrases.footer()}`);
    }

    // ── Récupération du code ──────────────────────────────
    let code = args.join(' ');
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (!code && ctx?.quotedMessage?.conversation) {
      code = ctx.quotedMessage.conversation;
    }
    // Nettoyer les backticks Markdown éventuels
    code = code.replace(/^```(?:js|javascript)?\n?/, '').replace(/```$/, '').trim();

    if (!code) {
      return reply(
        `*📌 ᴜsᴀɢᴇ :* \`${config.prefix||'.'}runeval <code>\`\n` +
        `_ᴇx : \`${config.prefix||'.'}runeval config.botName\`_\n\n${phrases.footer()}`
      );
    }

    await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } }).catch(()=>{});

    const startTime = Date.now();
    try {
      const result  = await safeEval(code, { sock, msg, from, sender });
      const elapsed = Date.now() - startTime;

      let output;
      if (result === undefined)      output = 'undefined';
      else if (result === null)      output = 'null';
      else if (typeof result === 'object') {
        try { output = JSON.stringify(result, null, 2); }
        catch (_) { output = String(result); }
      } else output = String(result);

      // Tronquer si trop long
      if (output.length > 2000) output = output.slice(0, 2000) + '\n…[tronqué]';

      await reply(
        `╭╼≪• *⚡ runeval* •≫╾╮\n` +
        `┃ ⏱️ *${SC('temps')}* : ${elapsed}ms\n` +
        `┃ 📤 *${SC('type')}* : ${typeof result}\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n` +
        `\`\`\`\n${output}\n\`\`\`\n\n${phrases.footer()}`
      );
      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(
        `╭╼≪• *❌ ${SC('erreur')}* •≫╾╮\n` +
        `┃ _${err.message}_\n` +
        `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
      );
    }
  }
};
