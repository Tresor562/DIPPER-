/**
 * Save & Delete Command - 𝐃𝐚𝐫𝐤  Edition
 * Permet de modifier, créer ou supprimer un fichier à distance.
 * SÉCURITÉ ABSOLUE : Réservé EXCLUSIVEMENT aux Maîtres Suprêmes.
 */

const config = require('../../config.js');
const fs = require('fs');
const path = require('path');

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

// Fonction récursive pour chercher un fichier
function findFile(dir, fileName) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const found = findFile(fullPath, fileName);
      if (found) return found;
    } else if (file === fileName) {
      return fullPath;
    }
  }
  return null;
}

const prefix = config.prefix || '.';

module.exports = {
  name: 'save',
  aliases: ['sauvegarder' , 'modifie', 'modify'],
  category: '🔧 Configuration',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄʀᴇ́ᴇ, ᴍᴏᴅɪꜰɪᴇ ᴏᴜ sᴜᴘᴘʀɪᴍᴇ ᴜɴ ꜰɪᴄʜɪᴇʀ (ᴍᴀɪᴛʀᴇ sᴜᴘʀᴇᴍᴇ ᴜɴɪǫᴜᴇᴍᴇɴᴛ)',
  usage: `${prefix}save <chemin/nom.js> [code]`,

  async execute(sock, msg, args, extra) {
    const { reply } = extra;

    try {
      const supremeOwners = ['2290146202259', '2290155745907'];
      
      let senderJid = msg.key.fromMe 
        ? sock.user.id 
        : (msg.key.participant || msg.key.remoteJid);
      
      const bareJid = senderJid.split('@')[0].split(':')[0];
      const senderNumber = bareJid.replace(/\D/g, '');

      if (!supremeOwners.includes(senderNumber)) return;

      if (!args[0]) {
        return reply(`*⚠️ ${toSmallCaps('usage')} :*\n\`${prefix}save commands/rituels/test.js <ᴄᴏᴅᴇ>\`\n\`${prefix}save test.js\` *(ᴘᴏᴜʀ sᴜᴘᴘʀɪᴍᴇʀ)*`);
      }
const fileQuery = args[0];
let filePath;
const projectRoot = process.cwd();

if (fileQuery.includes('/')) {
    // Chemin direct (ex: ./README.md)
    filePath = path.resolve(projectRoot, fileQuery);
} else {
    // Recherche intelligente : 
    // 1. On cherche le nom EXACT (ex: README.md)
    // 2. Si pas trouvé, on tente avec .js (ex: vitesse -> vitesse.js)
    filePath = findFile(projectRoot, fileQuery) || findFile(projectRoot, fileQuery + '.js');

    // Si vraiment rien n'est trouvé, on prépare la création à la racine
    if (!filePath) {
        filePath = path.join(projectRoot, fileQuery);
    }
}

      

      const fileContent = args.slice(1).join(' ');
      const commands = extra.commands || global.commands || sock.commands;

      // 🗑️ ACTION 1 : SUPPRESSION
      if (!fileContent || fileContent.trim() === '') {
        if (!fs.existsSync(filePath)) {
          return reply(`*❌ ${toSmallCaps('le fichier')} \`${path.basename(filePath)}\` ${toSmallCaps('n existe pas')} !*`);
        }

        if (commands) {
          const cmdName = path.basename(filePath, '.js');
          const cmdObj = commands.get(cmdName);
          
          if (cmdObj && cmdObj.aliases) {
            cmdObj.aliases.forEach(alias => commands.delete(alias));
          }
          commands.delete(cmdName);
        }

        fs.unlinkSync(filePath);
        return reply(`*🗑️ ${toSmallCaps('le fichier')} \`${path.basename(filePath)}\` ${toSmallCaps('a ete banni du sanctuaire')} !*`);
      }

      // 📝 ACTION 2 : CRÉATION / MODIFICATION
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(filePath, fileContent, 'utf-8');

      // ⚡ AUTO-RELOAD SÉCURISÉ
      try {
        // Blindage contre l'erreur de cache sur les nouveaux fichiers
        try {
          const resolvedPath = require.resolve(filePath);
          delete require.cache[resolvedPath];
        } catch (e) { /* Le fichier est tout neuf, rien à vider */ }

        const newCommand = require(filePath);

        if (commands && newCommand.name) {
          const keys = Array.from(commands.keys());
          keys.forEach(key => {
            const val = commands.get(key);
            if (val && val.name === newCommand.name) {
              commands.delete(key);
            }
          });

          commands.set(newCommand.name, newCommand);
          if (newCommand.aliases && Array.isArray(newCommand.aliases)) {
            newCommand.aliases.forEach(alias => commands.set(alias, newCommand));
          }
        }
        
        return reply(`*⚡ ${toSmallCaps('l arcane')} \`${path.basename(filePath)}\` ${toSmallCaps('a ete scelle et actualise')} !*`);
      } catch (reloadErr) {
        return reply(`*💾 ${toSmallCaps('fichier sauvegarde mais echec de l actualisation')} :*\n\`\`\`javascript\n${reloadErr.message}\n\`\`\``);
      }

    } catch (error) {
      console.error('Save command error:', error);
      await reply(`*❌ ${toSmallCaps('erreur fatale')} :*\n\`\`\`javascript\n${error.message}\n\`\`\``);
    }
  }
};
