/**
 * Global Configuration for WhatsApp MD - THE BIG DIPPER
 * Commandement central de l'escouade.
 * Toutes les variables booléennes (true/false) sont lues depuis le fichier .env
 * pour une synchronisation totale.
 */

require('dotenv').config();

module.exports = {

    // 👑 LES MAÎTRES SUPRÊMES (Numéros visibles pour une autorité absolue)
    supremeOwners: ['2290146202259', '2290155745907'],

    // LIDs Suprêmes (identifiants internes WhatsApp)
    supremeOwnerLids: ['188055763857491@lid', '274053894017167@lid'],

    // Configuration des gérants secondaires
    ownerNumber: process.env.PHONE_NUMBER ? [process.env.PHONE_NUMBER] : ['2290146202259', '2290155745907'],
    ownerName: [process.env.OWNER_NAME || 'Trésor'],

    // Configuration de l'escouade
    botName: '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',

    // [FIX] Nom du dossier de session (mono-session)
    // En multi-session MongoDB, chaque session a sa propre collection.
    sessionName: process.env.SESSION_NAME || 'auth_info_baileys',

    // Le préfixe lu directement depuis le .env
    prefix: process.env.PREFIX || '.',

    newsletterJid: '120363411005383995@newsletter',
    updateZipUrl: 'https://github.com/-X-/archive/refs/heads/main.zip',

    packname: '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',

    // 🔐 GESTION DES ACCÈS (RÈGLES D'OR GHOSTG-X)
    public: process.env.PUBLIC_MODE === 'true',
    selfMode: process.env.SELF_MODE === 'true',
    
    // Le NLE (IA Langage Naturel) s'active via le .env (on/off)
    ghostgMode: process.env.GHOSTG_MODE ? process.env.GHOSTG_MODE.toLowerCase() : 'on',

    // Comportement de **ʟ'ᴏᴍʙʀᴇ**
    autoRead: false,
    autoTyping: false,
    autoBio: process.env.AUTO_BIO === 'true',
    autoSticker: false,
    autoReact: process.env.AUTOREACT === 'true',
    autoReactMode: 'bot', 
    autoDownload: false,

    // Paramètres par défaut des Cercles (Groupes)
    defaultGroupSettings: {
      antilink: false,
      antilinkAction: 'delete',
      antitag: false,
      antitagAction: 'delete',
      antiall: false,
      antiviewonce: false,
      antibot: false,
      anticall: process.env.ANTICALL === 'true',
      antigroupmention: false,
      antigroupmentionAction: 'delete',

      welcome: process.env.WELCOME_MSG === 'true',
      welcomeMsg: `┌─「 THE BIG DIPPER 」\n│ Nouvelle recrue : @\${displayName}\n│ Effectif de l'escouade : #\${groupMetadata.participants.length}\n│ Heure d'entrée : \${timeString}\n› Tu es désormais sous le commandement de \${groupName}.\n└─ Discipline absolue. Aucune exception.`,

      goodbye: process.env.GOODBYE_MSG === 'true',
      goodbyeMsg: `┌─「 THE BIG DIPPER // ESCOUADE 」\n│ Départ : @\${userNumber}\n│ Effectif restant : \${groupMetadata.participants.length}\n│ Heure : \${timeString}\n└─ Un rang de moins. Le commandement continue.`,

      antiSpam: false,
      antidelete: false, 
      nsfw: false,
      detect: false,
      chatbot: false,
      autosticker: false
    },

    // Clés d'API (Invocations tierces)
    apiKeys: {
      openai: '',
      deepai: '',
      remove_bg: ''
    },

    // Messages système — THE BIG DIPPER
    messages: {
      wait: '┌─「 THE BIG DIPPER // OPÉRATION 」\n│ Traitement en cours...\n└─ Patiente.',
      success: '┌─「 THE BIG DIPPER // EXÉCUTÉ 」\n│ Ordre effectué avec succès.\n└─ Mission accomplie.',
      error: '┌─「 THE BIG DIPPER // ÉCHEC 」\n› Une anomalie a interrompu l\'opération.\n└─»»» Réessaie ou contacte le commandement.',
      ownerOnly: '┌─「 THE BIG DIPPER // ACCÈS 」\n› Cet ordre est réservé au Chef de Clan.\n└─»»» Accès refusé.',
      adminOnly: '┌─「 THE BIG DIPPER // ACCÈS 」\n› Cet ordre est réservé aux gradés de l\'escouade.\n└─»»» Accès refusé.',
      groupOnly: '┌─「 THE BIG DIPPER // OPÉRATION 」\n› Cet ordre ne s\'exécute qu\'au sein d\'un groupe.\n└─»»» Zone d\'action invalide.',
      privateOnly: '┌─「 THE BIG DIPPER // OPÉRATION 」\n› Cet ordre ne s\'exécute qu\'en message privé.\n└─»»» Zone d\'action invalide.',
      botAdminNeeded: '┌─「 THE BIG DIPPER // OPÉRATION 」\n› L\'unité doit être administrateur pour exécuter cet ordre.\n└─»»» Élévation de rang requise.',
      invalidCommand: '┌─「 THE BIG DIPPER // INCONNU 」\n› Ordre non reconnu. Consulte .menu pour la liste des commandes.\n└─ Fin de transmission.'
    },

    timezone: 'Africa/Ouagadougou',
    maxWarnings: 3,

    social: {
      github: 'https://github.com/-X-',
      whatsappChannel: 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V',
      whatsappGroup: 'https://chat.whatsapp.com/IFUx2XwT55o6yHqmaKf3DW'
    },

    // ══════════════════════════════════════════════════════════
    // 🧠 MEMORY GUARD — Seuils de surveillance RAM
    // ══════════════════════════════════════════════════════════
    // warnMB     : nettoyage doux déclenché (défaut : 250 Mo)
    // criticalMB : redémarrage propre PM2 si encore élevé (défaut : 350 Mo)
    // enabled    : mettre false pour désactiver complètement
    // notifyOwner: envoyer un message WhatsApp avant le restart
    memoryGuard: {
        enabled     : true,
        warnMB      : 250,
        criticalMB  : 350,
        notifyOwner : true,
    },

};
