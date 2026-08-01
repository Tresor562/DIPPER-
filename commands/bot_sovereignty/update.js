/**
 * Update Command - 𝐃𝐈𝐏𝐏𝐄𝐑 Prestige Edition
 * Récupère le dernier code via une archive ZIP
 * PRÉSERVE : node_modules, session, .env, config.js, etc.
 * AUTOMATISE : npm install si nécessaire
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const sessionContext = require('../../utils/sessionContext');

let config;
try {
  config = require('../../config');
} catch (e) {
  config = {};
}

const prefix = config.prefix || '.';

// Fonction utilitaire pour Small Caps
function toSmallCaps(text) {
  const normal = "abcdefghijklmnopqrstuvwxyz0123456789";
  const smallCaps = "ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789";
  const cleanedText = String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
  return cleanedText.split('').map(c => {
    const index = normal.indexOf(c);
    return index !== -1 ? smallCaps[index] : c;
  }).join('');
}

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
      resolve((stdout || '').toString());
    });
  });
}

async function extractZip(zipPath, outDir) {
  if (process.platform === 'win32') {
    const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\/g, '/')}' -Force"`;
    await run(cmd);
    return;
  }

  // Sur Linux, on tente unzip puis 7z
  try { await run(`unzip -o '${zipPath}' -d '${outDir}'`); return; } catch {}
  try { await run(`7z x -y '${zipPath}' -o'${outDir}'`); return; } catch {}
  throw new Error('Aucun outil d\'extraction trouvé sur le système (unzip/7z). Installez-le sur votre VPS.');
}

// Remplacement robuste par le pipeline de flux Node.js
async function downloadFile(url, dest) {
  const response = await fetch(url, { headers: { 'User-Agent': '𝐃𝐈𝐏𝐏𝐄𝐑-Updater/2.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
  const fileStream = fs.createWriteStream(dest);
  
  // Utilisation de pipeline qui gère la consommation du flux et ferme le fichier automatiquement
  await pipeline(response.body, fileStream);
}

function copyRecursive(src, dest, ignore = [], relative = '', outList = []) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (ignore.includes(entry)) continue;

    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const stat = fs.lstatSync(s);
    if (stat.isDirectory()) {
      copyRecursive(s, d, ignore, path.join(relative, entry), outList);
    } else {
      fs.copyFileSync(s, d);
      outList.push(path.join(relative, entry).replace(/\\/g, '/'));
    }
  }
}

async function updateViaZip(zipUrl) {
  // [PHASE 2 — SUITE] tmp/<sessionId>/ — avant, process.cwd()/tmp était
  // partagé. Note : .update remplace le code de TOUTE la plateforme (une
  // seule base de code pour toutes les sessions), donc scoper ce dossier
  // n'isole pas l'EFFET de la mise à jour (qui reste global par nature) —
  // ça évite seulement que deux exécutions concurrentes de .update se
  // marchent dessus sur le zip/l'extraction en cours.
  const tmpDir = path.join(process.cwd(), 'tmp', sessionContext.getCurrentSessionId());
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, 'update.zip');
  const extractTo = path.join(tmpDir, 'update_extract');

  await downloadFile(zipUrl, zipPath);
  
  if (fs.existsSync(extractTo)) {
    fs.rmSync(extractTo, { recursive: true, force: true });
  }
  
  await extractZip(zipPath, extractTo);

  const entries = fs.readdirSync(extractTo);
  const rootCandidate = entries.length === 1 ? path.join(extractTo, entries[0]) : extractTo;
  const srcRoot = fs.existsSync(rootCandidate) && fs.lstatSync(rootCandidate).isDirectory() ? rootCandidate : extractTo;

  // 🛡️ LISTE DES ÉLÉMENTS PRÉSERVÉS (RÈGLE D'OR)
  const ignore = [
    'node_modules',
    '.git',
    'session',
    'tmp',
    'temp',
    'database',
    'config.js',
    '.env'
  ];

  // Vérification de mise à jour des dépendances
  let needNpmInstall = false;
  const oldPkgPath = path.join(process.cwd(), 'package.json');
  const newPkgPath = path.join(srcRoot, 'package.json');

  if (fs.existsSync(oldPkgPath) && fs.existsSync(newPkgPath)) {
    const oldPkg = fs.readFileSync(oldPkgPath, 'utf-8');
    const newPkg = fs.readFileSync(newPkgPath, 'utf-8');
    if (oldPkg !== newPkg) {
      needNpmInstall = true;
    }
  }

  const copied = [];
  copyRecursive(srcRoot, process.cwd(), ignore, '', copied);

  // Nettoyage sécurisé et 100% JS Natif
  try { 
    fs.rmSync(extractTo, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true }); 
  } catch {}

  // Installation auto des dépendances si nécessaire
  let npmSuccess = true;
  if (needNpmInstall) {
    try {
      await run('npm install --production');
    } catch (e) {
      console.error('Erreur npm install:', e);
      npmSuccess = false;
    }
  }

  return { copiedFiles: copied, needNpmInstall, npmSuccess };
}

module.exports = {
  name: 'mise_a_jour',
  aliases: ['update', 'maj', 'ᴍɪsᴇ_ᴀ_ᴊᴏᴜʀ'],
  category: '👑 Owner',
  ownerOnly: false, // Géré manuellement par hasAccess via isOwner
  description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ sᴇ ᴍᴇᴛ ᴀ̀ ᴊᴏᴜʀ ᴅᴇᴘᴜɪs ʟᴇ ʀᴇᴘᴏ ᴅᴇ ʟ\'ᴏʀᴀᴄʟᴇ',
  usage: `${prefix}mise_a_jour [ʟɪᴇɴ_ᴢɪᴘ]`,

  async execute(sock, msg, args, extra) {
    const { isOwner, reply, from } = extra;

    try {
      // 🛡️ BLINDAGE GHOSTG : Sécurité absolue
      const hasAccess = isOwner === true;

      if (!hasAccess) {
        return reply(`*〆 ᴛᴜ ɴ\'ᴀs ᴘᴀs ʟ\'ᴀᴜᴛᴏʀɪsᴀᴛɪᴏɴ sᴜᴘʀᴇ̂ᴍᴇ ᴘᴏᴜʀ ɪɴᴠᴏǫᴜᴇʀ ᴄᴇᴛᴛᴇ ᴘᴜɪssᴀɴᴄᴇ.*`);
      }

      const zipUrl = (args[0] || config.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();

      if (!zipUrl) {
        return reply(`*〆 ᴀᴜᴄᴜɴ ʟɪᴇɴ ᴅᴇ ᴍɪsᴇ ᴀ̀ ᴊᴏᴜʀ ᴛʀᴏᴜᴠᴇ́.*`);
      }

      await reply(`*🔮 ʟ\'ᴏʀᴀᴄʟᴇ ᴘʀᴏᴄᴇ̀ᴅᴇ ᴀ̀ ʟ\'ᴀsᴘɪʀᴀᴛɪᴏɴ ᴅᴇs ɴᴏᴜᴠᴇᴀᴜx ᴀʀᴄᴀɴᴇs... ᴘᴀᴛɪᴇɴᴛᴇ.*`);

      const { copiedFiles, needNpmInstall, npmSuccess } = await updateViaZip(zipUrl);

      let summary = `*✅ ᴍɪsᴇ ᴀ̀ ᴊᴏᴜʀ ᴀᴄᴄᴏᴍᴘʟɪᴇ ᴀᴠᴇᴄ sᴜᴄᴄᴇ̀s !*\n*📦 ғɪᴄʜɪᴇʀs ᴍɪs ᴀ̀ ᴊᴏᴜʀ : ${copiedFiles.length}*\n*🛡️ ᴛᴏɴ sᴇssɪᴏɴ, ᴛᴏɴ ᴄᴏɴғɪɢ.ᴊs ᴇᴛ ᴛᴏɴ .ᴇɴᴠ ᴏɴᴛ ᴇ́ᴛᴇ́ ᴘʀᴇ́sᴇʀᴠᴇ́s.*`;

      if (needNpmInstall) {
        if (npmSuccess) {
          summary += `\n\n*⚡ ʟᴇs ɴᴏᴜᴠᴇʟʟᴇs ᴅᴇ́ᴘᴇɴᴅᴀɴᴄᴇs ᴏɴᴛ ᴇ́ᴛᴇ́ ɪɴsᴛᴀʟʟᴇ́ᴇs !*`;
        } else {
          summary += `\n\n*⚠️ ʟ\'ɪɴsᴛᴀʟʟᴀᴛɪᴏɴ ᴅᴇs ᴅᴇ́ᴘᴇɴᴅᴀɴᴄᴇs ᴀ a ᴇ́ᴄʜᴏᴜᴇ́. ғᴀɪs ᴜɴ 'ɴᴘᴍ ɪɴsᴛᴀʟʟ' ᴍᴀɴᴜᴇʟ.*`;
        }
      }

      await sock.sendMessage(from, { text: `${summary}\n\n*🔄 ʀᴇ́ɪɴᴄᴀʀɴᴀᴛɪᴏɴ (ʀᴇᴅᴇ́ᴍᴀʀʀᴀɢᴇ) ᴇɴ ᴄᴏᴜʀs...*` }, { quoted: msg });

      // Petit délai pour laisser le message d'au revoir s'envoyer avant de tuer le processus
      setTimeout(() => process.exit(0), 1500);
    } catch (error) {
      await reply(`*〆 ʟ\'ɪɴᴠᴏᴄᴀᴛɪᴏɴ ᴀ ᴇ́ᴄʜᴏᴜᴇ́ : ${error.message}*`);
    }
  }
};
