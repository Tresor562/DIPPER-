/**
 * GhostFile Command - Omni-Matrix Edition
 * Accès total : Racine, Commands, Lib, Config, etc.
 * 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * SÉCURITÉ ABSOLUE : Seuls les Maîtres Suprêmes peuvent l'évoquer.
 * Version : 4.0 (Full System Search & Performance Fix)
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config.js');

// 1. Style Small Caps (Visuel 𝐃𝐚𝐫𝐤)
function toSmallCaps(text) {
  if (!text) return '';
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  const cleanedText = String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

// 2. Nettoyage pour la recherche (Bypass Small Caps dans les noms de dossiers)
function cleanForSearch(text) {
  if (!text) return '';
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  let cleaned = String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return cleaned.split('').map(c => {
    const index = smallCaps.indexOf(c);
    return index !== -1 ? normal[index] : c;
  }).join('').trim();
}

// 3. Recherche récursive OMNI-DIRECTIONNELLE (Fouille tout le bot)
function findFile(dir, fileName) {
  const files = fs.readdirSync(dir);
  const targetCleaned = cleanForSearch(fileName);

  for (const file of files) {
    // 🛡️ PROTECTION : On ignore les dossiers qui font ramer ou planter
    if (file === 'node_modules' || file === '.git' || file === '.cache') continue;

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    const currentCleaned = cleanForSearch(file);

    if (stat.isDirectory()) {
      const found = findFile(fullPath, fileName);
      if (found) return found;
    } else {
      // On accepte le nom exact, ou avec extensions courantes (.js, .md, .json, .txt)
      const matches = [
        currentCleaned === targetCleaned,
        currentCleaned === targetCleaned + '.js',
        currentCleaned === targetCleaned + '.md',
        currentCleaned === targetCleaned + '.json',
        currentCleaned === targetCleaned + '.txt'
      ];
      if (matches.some(m => m)) return fullPath;
    }
  }
  return null;
}

const prefix = config.prefix || '.';

module.exports = {
  name: 'darkfile',
  aliases: ['cat', 'write', 'savefile', 'lirefile', 'gf', 'ghostfile'],
  category: '🔧 Configuration',
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴀᴄᴄᴇs ᴛᴏᴛᴀʟ ᴀᴜx ғɪᴄʜɪᴇʀs (ʀᴀᴄɪɴᴇ, ʟɪʙ, ᴄᴏᴍᴍᴀɴᴅs)',
  usage: `${prefix}cat <nom_fichier>\n${prefix}write <nom_ou_chemin> | <contenu>`,
  groupOnly: false,
  adminOnly: false,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, isSupremeOwner } = extra;

    try {
      // 🛡️ Sécurité : uniquement le système d'autorisation centralisé du
      // projet (extra.isOwner / extra.isSupremeOwner, fournis par
      // handler.js/buildExtra à partir de config.js). Aucune liste de
      // numéros codée en dur — un accès fichier total ne doit dépendre
      // que de la configuration officielle du propriétaire.
      if (isOwner !== true && isSupremeOwner !== true) return;

      const fullText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
      const cleanText = fullText.startsWith(prefix) ? fullText.slice(prefix.length) : fullText;
      const commandTrigger = cleanText.split(/\s+/)[0].toLowerCase();

      const projectRoot = process.cwd(); // LA MATRICE : Racine du bot
      const commands = extra.commands || global.commands || sock.commands;

      // ─── 1. MODE LECTURE (.cat / .read) ───
      if (['cat', 'read'].includes(commandTrigger)) {
        if (!args[0]) return reply(`*⚠️ ${toSmallCaps('indiquez le nom ou le chemin du fichier')} !*`);
        
        let filePath;
        if (!args[0].includes('/')) {
          filePath = findFile(projectRoot, args[0]); // Recherche partout
        } else {
          filePath = path.resolve(projectRoot, args[0]);
        }

        if (!filePath || !fs.existsSync(filePath) || !(filePath === projectRoot || filePath.startsWith(projectRoot + path.sep))) {
          return reply(`*❌ ${toSmallCaps('fichier introuvable ou hors matrice')} !*`);
        }

        const stats = fs.statSync(filePath);
        if (stats.size > 100000) return reply(`*⚠️ ${toSmallCaps('fichier trop lourd pour whatsapp')} !*`);

        const content = fs.readFileSync(filePath, 'utf8');
        const ext = path.extname(filePath).replace('.', '') || 'txt';

        return reply(`*📄 ғɪᴄʜɪᴇʀ :* \`${path.relative(projectRoot, filePath)}\`\n\`\`\`${ext}\n${content}\n\`\`\``);
      }

      // ─── 2. MODE ÉCRITURE (.write / .gf) ───
      if (['write', 'savefile', 'ghostfile', 'gf'].includes(commandTrigger)) {
        const rawContent = args.join(' ');
        if (!rawContent.includes('|')) return reply(`*⚠️ ${toSmallCaps('usage')} : .write <nom> | <contenu>*`);

        const parts = rawContent.split('|');
        const filePathStr = parts[0].trim();
        const fileContent = parts.slice(1).join('|').trim(); 

        let filePath;
        if (!filePathStr.includes('/')) {
          filePath = findFile(projectRoot, filePathStr);
          // Si le fichier n'existe pas encore, on le prépare à la racine par défaut
          if (!filePath) filePath = path.join(projectRoot, filePathStr.includes('.') ? filePathStr : filePathStr + '.js');
        } else {
          filePath = path.resolve(projectRoot, filePathStr);
        }

        if (!(filePath === projectRoot || filePath.startsWith(projectRoot + path.sep))) return reply(`*❌ ${toSmallCaps('ecriture interdite hors du sanctuaire')} !*`);

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, fileContent, 'utf8');

        // ⚡ AUTO-RELOAD (Seulement pour les fichiers JS dans le dossier commands)
        if (filePath.endsWith('.js') && filePath.includes(path.sep + 'commands' + path.sep)) {
          try {
            const resPath = require.resolve(filePath);
            delete require.cache[resPath];
            const newCommand = require(filePath);
            if (commands && newCommand.name) {
              commands.set(newCommand.name, newCommand);
              if (newCommand.aliases) newCommand.aliases.forEach(a => commands.set(a, newCommand));
            }
            return reply(`*⚡ ${toSmallCaps('arcane actualisee')} :* \`${path.basename(filePath)}\``);
          } catch (e) {
            return reply(`*💾 ${toSmallCaps('grave mais erreur reload')} :* \`${e.message}\``);
          }
        }

        return reply(`*💾 ${toSmallCaps('fichier enregistre avec succes')} :* \`${path.relative(projectRoot, filePath)}\``);
      }

    } catch (error) {
      console.error(error);
      return reply(`*❌ ${toSmallCaps('erreur fatale')} !*`);
    }
  }
};
