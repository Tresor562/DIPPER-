const config = require('../../config');
const fs = require('fs');
const path = require('path');

const prefix = config.prefix;

module.exports = {
  name: 'domaine',
  aliases: ['botmode', 'privatemode', 'publicmode', 'mode', 'ᴅᴏᴍᴀɪɴᴇ'],
  category: '👑 Owner',
  ownerOnly: false,
  description: `『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ʙᴀsᴄᴜʟᴇ ʟ'ᴏᴍʙʀᴇ ᴇɴᴛʀᴇ ʟᴇ ᴍᴏᴅᴇ ᴘʀɪᴠᴇ́ ᴇᴛ ᴘᴜʙʟɪᴄ`,
  usage: `${prefix}domaine <prive/public>`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner } = extra;
    
    const isSelfMode = process.env.SELF_MODE === 'true' || config.selfMode === true;
    const isGroup = msg.key.remoteJid.endsWith('@g.us');

    const supremeOwners = ['2290146202259', '2290155745907'];

    let senderJid = msg.key.fromMe 
      ? sock.user.id 
      : (msg.key.participant || msg.key.remoteJid);
    
    const cleanSenderJid = senderJid.split('@')[0].split(':')[0];
    const senderNumber = cleanSenderJid.replace(/\D/g, '');

    const isSupreme = supremeOwners.includes(senderNumber);
    const isLocalOwner = isOwner === true;

    // 🛡️ BLINDAGE GROUPE EN MODE PRIVÉ
    if (isGroup && isSelfMode) {
      if (!isSupreme && !isLocalOwner) return; // Mutisme total pour les intrus
    }

    // 🔓 Le droit d'utiliser la commande .domaine reste pour toi et l'owner
    const hasAccess = isSupreme || isLocalOwner;
    if (!hasAccess) return;

    // Discrétion totale : on ne répond pas aux intrus

    const envPath = path.join(process.cwd(), '.env');

    try {
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      
      const isCurrentlyPrivate = /^SELF_MODE=true/m.test(envContent);

      if (!args[0]) {
        const currentMode = isCurrentlyPrivate ? 'ᴘʀɪᴠᴇ́' : 'ᴘᴜʙʟɪᴄ';
        const description = isCurrentlyPrivate 
          ? `*sᴇᴜʟ ʟᴇ ᴄᴏᴍᴍᴀɴᴅᴇᴜʀ ᴅᴇ ʟ'ᴏᴍʙʀᴇ ᴘᴇᴜᴛ ɪɴᴠᴏǫᴜᴇʀ ʟᴇs ᴀʀᴄᴀɴᴇs*`
          : 'ᴛᴏᴜᴛᴇs ʟᴇs ᴀ̂ᴍᴇs ᴘᴇᴜᴠᴇɴᴛ ɪɴᴠᴏǫᴜᴇʀ ʟᴇs ᴀʀᴄᴀɴᴇs';

        return reply(
          `*╭╼━≪• ᴇ́ᴛᴀᴛ ᴅᴜ ᴅᴏᴍᴀɪɴᴇ •≫━╾╮*\n` +
          `*┃ 🔮 ᴍᴏᴅᴇ ᴀᴄᴛᴜᴇʟ : ${currentMode}*\n` +
          `*┃ 📜 sᴛᴀᴛᴜᴛ* : ${description}\n` +
          `*╰━━━━━━━━━━━━━━━━━━━━━╯*\n\n` +
          `*☬ ᴜsᴀɢᴇ :*\n` +
          `  • \`${prefix}domaine prive\` - seul le maitre a le pouvoir\n` +
          `  • \`${prefix}domaine public\` - les portes sont ouvertes*\n\n` +
          extra.phrases.footer()
        );
      }

      const mode = args[0].toLowerCase();

      // Fonction utilitaire pour mettre à jour proprement le .env
      const updateEnv = (key, value) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent = envContent.trim() + `\n${key}=${value}`;
        }
        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
      };

      // 🔒 CAS PRIVÉ
      if (mode === 'private' || mode === 'priv' || mode === 'privé' || mode === 'prive') {
        if (isCurrentlyPrivate) {
          return reply(`*🔒 ʟ'ᴏᴍʙʀᴇ ᴇsᴛ ᴅᴇ́ᴊᴀ̀ sᴄᴇʟʟᴇ́ ᴇɴ ᴍᴏᴅᴇ ᴘʀɪᴠᴇ́.*\n\n${extra.phrases.footer()}`);
        }

        updateEnv('SELF_MODE', 'true');

        // 🧠 APPLICATION IMMÉDIATE EN MÉMOIRE VIVE GLOBALE
        process.env.SELF_MODE = 'true';
        config.selfMode = true;
        config.public = false; 

        return reply(`*🔒 ʟ'ᴏᴍʙʀᴇ ᴇsᴛ ᴅᴇ́sᴏʀᴍᴀɪs ᴘʀɪᴠᴇ́.*\n*sᴇᴜʟ ʟᴇ sᴜᴘʀᴇ̂ᴍᴇ ᴄᴏᴍᴍᴀɴᴅᴇᴜʀ ᴀ ʟᴇ ᴘᴏᴜᴠᴏɪʀ*.\n\n${extra.phrases.footer()}`);
      }

      // 🌐 CAS PUBLIC
      if (mode === 'public' || mode === 'pub') {
        if (!isCurrentlyPrivate) {
          return reply(`*🌐 ʟ'ᴏᴍʙʀᴇ ᴇsᴛ ᴅᴇ́ᴊᴀ̀ ᴏᴜᴠᴇʀᴛ ᴇɴ ᴍᴏᴅᴇ ᴘᴜʙʟɪᴄ.*\n\n${extra.phrases.footer()}`);
        }

        updateEnv('SELF_MODE', 'false');

        // 🧠 APPLICATION IMMÉDIATE EN MÉMOIRE VIVE GLOBALE
        process.env.SELF_MODE = 'false';
        config.selfMode = false;
        config.public = true;

        return reply(`*🌐 ʟ'ᴏᴍʙʀᴇ ᴇsᴛ ᴅᴇ́sᴏʀᴍᴀɪs ᴘᴜʙʟɪᴄ.*\n*ʟᴇs ᴘᴏʀᴛᴇs sᴏɴᴛ ᴏᴜᴠᴇʀᴛᴇs ᴀ̀ ᴛᴏᴜᴛᴇs ʟᴇs ᴀ̂ᴍᴇs.*\n\n${extra.phrases.footer()}`);
      }

      return reply(`*〆 ᴍᴏᴅᴇ ɪɴᴠᴀʟɪᴅᴇ ! ᴜᴛɪʟɪsᴇ : ${prefix}domaine <prive/public>*`);

    } catch (error) {
      console.error('Mode command error:', error);
      await reply('*〆 ᴜɴᴇ ᴇʀʀᴇᴜʀ ᴀ ᴇ̂ᴍᴘᴇ̂ᴄʜᴇ́ ʟᴀ ᴛʀᴀɴsᴍᴜᴛᴀᴛɪᴏɴ ᴅᴜ ᴅᴏᴍᴀɪɴᴇ.*');
    }
  }
};
