/**
 * GenPass Command — 𝐃𝐚𝐫𝐤 Edition
 * .genpass [longueur] [options]
 * Génère un ou plusieurs mots de passe sécurisés.
 *
 * Options : .genpass 16        → longueur 16
 *           .genpass 12 3      → 3 mots de passe de 12 caractères
 *           .genpass 20 1 -s   → sans caractères spéciaux
 */
const crypto = require('crypto');
const config = require('../../config.js');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

/**
 * Génère un mot de passe cryptographiquement sécurisé.
 * Utilise crypto.randomBytes (plus sécurisé que Math.random).
 * @param {number} len       — longueur souhaitée
 * @param {boolean} specials — inclure des caractères spéciaux
 */
function generatePassword(len = 16, specials = true) {
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits  = '0123456789';
  const special = '!@#$%^&*()-_=+[]{}|;:,.<>?';
  const charset = lower + upper + digits + (specials ? special : '');

  const bytes = crypto.randomBytes(len * 2); // marge de sécurité
  let pass = '';
  for (let i = 0; pass.length < len; i++) {
    const idx = bytes[i] % charset.length;
    pass += charset[idx];
  }
  return pass;
}

/**
 * Évalue la force du mot de passe (0-100)
 */
function strengthScore(pass) {
  let score = 0;
  if (pass.length >= 8)  score += 20;
  if (pass.length >= 12) score += 10;
  if (pass.length >= 16) score += 10;
  if (/[a-z]/.test(pass)) score += 15;
  if (/[A-Z]/.test(pass)) score += 15;
  if (/[0-9]/.test(pass)) score += 15;
  if (/[^a-zA-Z0-9]/.test(pass)) score += 15;
  const label = score >= 80 ? '🟢 ꜰᴏʀᴛ' : score >= 50 ? '🟡 ᴍᴏʏᴇɴ' : '🔴 ꜰᴀɪʙʟᴇ';
  return { score, label };
}

module.exports = {
  name:'genpass', aliases:['password','mdp','passwd','motdepasse','generatepass'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɢᴇ́ɴᴇ̀ʀᴇ ᴅᴇs ᴍᴏᴛs ᴅᴇ ᴘᴀssᴇ sᴇ́ᴄᴜʀɪsᴇ́s 🔐',
  usage:`${config.prefix||'.'}genpass [longueur] [nombre]`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;
    try {

    const len      = Math.min(Math.max(parseInt(args[0]) || 16, 4), 64);
    const count    = Math.min(Math.max(parseInt(args[1]) || 1, 1), 10);
    const specials = !args.includes('-s');

    await sock.sendMessage(from, { react: { text: '🔐', key: msg.key } }).catch(()=>{});

    const passwords = Array.from({ length: count }, () => {
      const pass = generatePassword(len, specials);
      const { label } = strengthScore(pass);
      return { pass, label };
    });

    let text =
      `╭╼≪• *🔐 ${SC('générateur de mots de passe')}* •≫╾╮\n` +
      `┃\n` +
      `┃ 📏 *${SC('longueur')}* : ${len} caractères\n` +
      `┃ 🔣 *${SC('spéciaux')}* : ${specials ? '✅' : '❌'}\n` +
      `┃\n`;

    passwords.forEach((p, i) => {
      text += `┃ 🔑 \`${p.pass}\`\n`;
      text += `┃    ${p.label}\n`;
      if (i < passwords.length - 1) text += `┃\n`;
    });

    text += `┃\n┃ ⚠️ _${SC('ne jamais partager vos mots de passe')}_\n`;
    text += `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`;

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    await reply(text);
    } catch (err) {
      console.error('[genpass] Erreur:', err.message);
      try { await reply(`❌ Erreur : ${err.message}`); } catch (_) {}
    }
  }
};
