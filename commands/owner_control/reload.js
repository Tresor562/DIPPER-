/**
 * Reload Command - Omni-Search Edition
 * Version : 4.5 (Special Fix pour Dossiers Stylisés & Noms)
 */

const path = require('path');
const fs = require('fs');
const config = require('../../config.js');

function toSmallCaps(text) {
  if (!text) return '';
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  return String(text).toLowerCase().split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

// Nettoie les noms pour la comparaison (ignore le style Small Caps)
function cleanName(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  return String(text).toLowerCase().split('').map(c => {
    const index = smallCaps.indexOf(c);
    return index !== -1 ? normal[index] : c;
  }).join('').replace('.js', '');
}

// 📂 RECHERCHE RÉCURSIVE AVANCÉE
function findFileDeep(dir, targetName) {
  const files = fs.readdirSync(dir);
  const target = cleanName(targetName);

  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === '.cache') continue;

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const found = findFileDeep(fullPath, targetName);
      if (found) return found;
    } else {
      const currentFile = cleanName(file);
      if (currentFile === target) return fullPath;
    }
  }
  return null;
}

module.exports = {
  name: 'reload',
  aliases: ['recoder', 'rel'],
  category: '🔧 Configuration',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʀᴇᴄʜᴀʀɢᴇ ʟ ᴀʀᴄᴀɴᴇ ᴅᴀɴs ʟᴀ ᴍᴀᴛʀɪᴄᴇ',
  usage: `${config.prefix || '.'}reload <nom_commande>`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;

    try {
      const supremeOwners = ['2290146202259', '2290155745907'];
      let senderJid = msg.key.fromMe ? sock.user.id : (msg.key.participant || msg.key.remoteJid);
      const senderNumber = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');

      if (!supremeOwners.includes(senderNumber) && isOwner !== true) return;
      if (!args[0]) return reply(`*⚠️ ${toSmallCaps('indiquez le nom de l arcane')} !*`);

      const query = args[0].toLowerCase();
      const commands = global.commands || extra.commands || sock.commands;

      if (!commands) return reply(`*❌ ${toSmallCaps('lexique introuvable')} !*`);

      // 1. On cherche la commande dans la Map
      const cmd = commands.get(query) || [...commands.values()].find(c => c.aliases && c.aliases.includes(query));

      if (!cmd) return reply(`*❌ ${toSmallCaps('arcane inconnue')} :* \`${query}\``);

      // 2. Recherche Physique avec Tolérance de Nom
      const projectRoot = process.cwd();
      // On essaie avec le nom interne de la commande d'abord
      let filePath = findFileDeep(projectRoot, cmd.name);
      
      // Si pas trouvé, on essaie avec ce que l'utilisateur a tapé
      if (!filePath) filePath = findFileDeep(projectRoot, query);

      if (!filePath) return reply(`*❌ ${toSmallCaps('fichier physique introuvable pour')}* \`${cmd.name}.js\``);

      try {
        delete require.cache[require.resolve(filePath)];
        const newCommand = require(filePath);

        // Nettoyage précis
        for (const [key, value] of commands.entries()) {
          if (value.name === cmd.name) commands.delete(key);
        }

        // Réinjection
        commands.set(newCommand.name, newCommand);
        if (newCommand.aliases) {
          newCommand.aliases.forEach(alias => commands.set(alias, newCommand));
        }

        return reply(`*⚡ ${toSmallCaps('transmigration reussie')} !*\n*Arcane :* \`${newCommand.name}\`\n*Origine :* \`${path.relative(projectRoot, filePath)}\``);

      } catch (err) {
        return reply(`*❌ ${toSmallCaps('erreur syntaxe')} :*\n\`\`\`${err.message}\`\`\``);
      }

    } catch (e) {
      console.error(e);
      return reply(`*❌ ${toSmallCaps('erreur critique')} !*`);
    }
  }
};
