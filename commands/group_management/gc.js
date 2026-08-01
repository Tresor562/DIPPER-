'use strict';
/**
 * gc.js — Post text / image / video / audio as a WhatsApp Group Status
 * Adapté pour 𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑 depuis une commande "gcstatus" externe.
 *
 * [ADAPTATION] Ce fichier est une intégration fidèle du code fourni : la
 * logique, les conditions, les vérifications et les comportements internes
 * n'ont PAS été modifiés. Seules les adaptations strictement nécessaires à
 * la compatibilité avec l'architecture DIPPER ont été faites :
 *   - export : function unique → objet { name, aliases, execute } (format
 *     attendu par utils/commandLoader.js)
 *   - import 'isOwnerOrSudo' : '../lib/isOwner' n'existe pas dans DIPPER →
 *     remplacé par un helper local de même signature, basé sur les vraies
 *     fonctions isAnyOwner/isSudoUser de handler.js (require lazy pour
 *     éviter la dépendance circulaire, même pattern que
 *     commands/group_guardians/kickall.js)
 *   - CONFIG_PATH : chemin corrigé pour la structure commands/<catégorie>/
 *     de DIPPER (2 niveaux jusqu'à la racine, au lieu d'1 dans le bot d'origine)
 *   - textes utilisateur : traduits en français, "$gcstatus" remplacé par
 *     l'usage réel (${prefix}gc), crédit "Daratech" remplacé par DIPPER
 *
 * $gc <texte>              — publie un statut texte (couleur enregistrée ou violet par défaut)
 * $gc (réponse à une image) — publie l'image en statut de groupe
 * $gc (réponse à une vidéo) — publie la vidéo en statut de groupe
 * $gc (réponse à un audio)  — publie l'audio en statut de groupe
 * $gc color <nom>          — enregistre une couleur de fond personnalisée pour les statuts texte de ce groupe
 * $gc color reset          — réinitialise la couleur par défaut (violet)
 *
 * Admin uniquement, groupe uniquement (vérifié en interne par checkAuth,
 * comme dans le code source — aucun flag ownerOnly/adminOnly/groupOnly n'est
 * déclaré sur l'export ci-dessous, afin de ne pas superposer une seconde
 * couche de permission au-dessus de celle du code d'origine).
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { PassThrough } = require('stream');

const {
    generateWAMessageContent,
    generateWAMessageFromContent,
    downloadContentFromMessage,
} = require('@whiskeysockets/baileys');

// [ADAPTATION IMPORT] config du bot, pour afficher le préfixe réel dans les
// messages d'usage (à la place de "$gcstatus" codé en dur dans la source).
const config = require('../../config');
const prefix = config.prefix || '.';

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_COLOR = '#9C27B0'; // purple
// [ADAPTATION CHEMIN] commands/group_management/gc.js → 2 niveaux jusqu'à la
// racine DIPPER (le bot d'origine avait ses commandes à un seul niveau de
// profondeur : '../data/...' suffisait, ici il faut '../../data/...').
const CONFIG_PATH   = path.join(__dirname, '../../data/gcstatus.json');

function loadColors() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return {};
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch { return {}; }
}
function saveColors(cfg) {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch {}
}
function getColor(groupId) {
    return loadColors()[groupId] || DEFAULT_COLOR;
}
function setColor(groupId, color) {
    const cfg = loadColors();
    cfg[groupId] = color;
    saveColors(cfg);
}
function resetColor(groupId) {
    const cfg = loadColors();
    delete cfg[groupId];
    saveColors(cfg);
}

// ── Color name → hex map ──────────────────────────────────────────────────────
const COLOR_MAP = {
    purple:    '#9C27B0',
    violet:    '#7B1FA2',
    pink:      '#E91E63',
    hotpink:   '#FF4081',
    red:       '#F44336',
    orange:    '#FF5722',
    amber:     '#FF8F00',
    yellow:    '#FFC107',
    lime:      '#8BC34A',
    green:     '#4CAF50',
    teal:      '#009688',
    cyan:      '#00BCD4',
    blue:      '#2196F3',
    navy:      '#1565C0',
    indigo:    '#3F51B5',
    black:     '#212121',
    dark:      '#263238',
    grey:      '#607D8B',
    white:     '#FAFAFA',
    brown:     '#795548',
    gold:      '#F9A825',
    maroon:    '#880E4F',
};

const COLOR_NAMES = Object.keys(COLOR_MAP).join(', ');

function resolveColor(input) {
    const lower = input.toLowerCase();
    if (COLOR_MAP[lower]) return COLOR_MAP[lower];
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(input)) return input;
    return null;
}

// ── Auth helper ───────────────────────────────────────────────────────────────
// [ADAPTATION IMPORT] '../lib/isOwner' n'existe pas dans DIPPER. Remplacé par
// un helper LOCAL de même signature (senderId, sock, chatId) pour que le site
// d'appel dans checkAuth() ci-dessous reste identique au code source.
// Logique préservée à l'identique : owner OU sudo → autorisé.
async function isOwnerOrSudo(senderId, sock, chatId) {
    // require lazy pour éviter la dépendance circulaire avec handler.js
    // (même pattern que commands/group_guardians/kickall.js)
    const { isAnyOwner, isSudoUser } = require('../../handler');
    return isAnyOwner(senderId) || isSudoUser(senderId);
}

async function checkAuth(sock, chatId, senderId, message) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: `❌ *${prefix}gc* est une commande réservée aux groupes.` }, { quoted: message });
        return false;
    }
    const isOwner = message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId);
    if (isOwner) return true;
    try {
        const meta = await sock.groupMetadata(chatId);
        if (meta.participants.some(p => p.id === senderId && p.admin)) return true;
    } catch {}
    await sock.sendMessage(chatId, { text: `❌ Seuls les administrateurs du groupe peuvent utiliser *${prefix}gc*.` }, { quoted: message });
    return false;
}

// ── Download quoted media buffer ──────────────────────────────────────────────
async function downloadQuotedMedia(quotedMsg, mtype) {
    const typeMap = {
        imageMessage:   'image',
        videoMessage:   'video',
        audioMessage:   'audio',
        stickerMessage: 'sticker',
    };
    const dlType = typeMap[mtype];
    if (!dlType) return null;

    const mediaObj = quotedMsg[mtype];
    if (!mediaObj) return null;

    const stream = await downloadContentFromMessage(mediaObj, dlType);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

// ── Convert audio to OGG/Opus voice note ─────────────────────────────────────
function toVoiceNote(buffer) {
    return new Promise((resolve) => {
        try {
            const ffmpeg = require('fluent-ffmpeg');
            const input  = new PassThrough();
            const output = new PassThrough();
            const chunks = [];

            input.end(buffer);

            ffmpeg(input)
                .noVideo()
                .audioCodec('libopus')
                .format('ogg')
                .audioChannels(1)
                .audioFrequency(48000)
                .on('error', () => resolve(buffer))
                .on('end',   () => resolve(Buffer.concat(chunks)))
                .pipe(output);

            output.on('data', c => chunks.push(c));
        } catch {
            resolve(buffer);
        }
    });
}

// ── Core group-status sender ──────────────────────────────────────────────────
async function postGroupStatus(sock, groupId, content) {
    const bgColor = content._bgColor || DEFAULT_COLOR;
    delete content._bgColor;

    const inside = await generateWAMessageContent(content, {
        upload: sock.waUploadToServer,
        backgroundColor: bgColor,
    });

    const secret = crypto.randomBytes(32);

    const msg = generateWAMessageFromContent(
        groupId,
        {
            messageContextInfo: { messageSecret: secret },
            groupStatusMessageV2: {
                message: {
                    ...inside,
                    messageContextInfo: { messageSecret: secret },
                },
            },
        },
        {}
    );

    await sock.relayMessage(groupId, msg.message, { messageId: msg.key.id });
    return msg;
}

// ── Main command handler ──────────────────────────────────────────────────────
async function gcstatusCommand(sock, chatId, senderId, message) {
    if (!await checkAuth(sock, chatId, senderId, message)) return;

    const raw  = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
    const args = raw.split(/\s+/).slice(1);
    const text = args.join(' ').trim();

    // ── $gc color <nom> | reset ────────────────────────────────────────
    if (args[0]?.toLowerCase() === 'color') {
        const val = args[1]?.toLowerCase();

        if (!val) {
            const cur = getColor(chatId);
            const curName = Object.keys(COLOR_MAP).find(n => COLOR_MAP[n] === cur) || cur;
            return sock.sendMessage(chatId, {
                text: `╭━━━「 🎨 *COULEUR STATUT GC* 」━━━\n` +
                      `┃\n` +
                      `┃ Actuel : *${curName}*\n` +
                      `┃ (${cur === DEFAULT_COLOR ? 'défaut' : 'personnalisé'})\n` +
                      `┃\n` +
                      `┃ ▸ *${prefix}gc color <nom>*  — définir la couleur\n` +
                      `┃ ▸ *${prefix}gc color reset*   — restaurer la couleur par défaut\n` +
                      `┃\n` +
                      `┃ *Couleurs disponibles :*\n` +
                      `┃ ${COLOR_NAMES}\n` +
                      `┃\n` +
                      `╰━━━━━━━━━━━━━━━━━━━━━\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
            }, { quoted: message });
        }

        if (val === 'reset') {
            resetColor(chatId);
            return sock.sendMessage(chatId, {
                text: `🎨 *Couleur du statut GC réinitialisée* à la couleur par défaut *violet*.\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
            }, { quoted: message });
        }

        const resolved = resolveColor(args[1]);
        if (!resolved) {
            return sock.sendMessage(chatId, {
                text: `❌ Couleur inconnue *"${val}"*.\n\nCouleurs disponibles :\n${COLOR_NAMES}\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
            }, { quoted: message });
        }

        setColor(chatId, resolved);
        return sock.sendMessage(chatId, {
            text: `✅ *Couleur du statut GC définie sur ${val} !*\n\nTous les futurs statuts texte de ce groupe utiliseront cette couleur.\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
        }, { quoted: message });
    }

    // ── Detect quoted message ─────────────────────────────────────────────────
    const ctxInfo    = message.message?.extendedTextMessage?.contextInfo;
    const quotedMsg  = ctxInfo?.quotedMessage;
    const mtype      = quotedMsg ? Object.keys(quotedMsg)[0] : null;

    // ── No quoted message → TEXT status ──────────────────────────────────────
    if (!quotedMsg) {
        if (!text) {
            return sock.sendMessage(chatId, {
                text: `╭━━━「 📢 *STATUT DE GROUPE* 」━━━\n` +
                      `┃\n` +
                      `┃ Publie du contenu en tant que statut de groupe.\n` +
                      `┃\n` +
                      `┃ *STATUT TEXTE :*\n` +
                      `┃ ▸ ${prefix}gc <votre message>\n` +
                      `┃\n` +
                      `┃ *STATUT MÉDIA :*\n` +
                      `┃ ▸ Répondez à une image/vidéo/audio\n` +
                      `┃   avec *${prefix}gc [légende facultative]*\n` +
                      `┃\n` +
                      `┃ *COULEUR PERSONNALISÉE (texte uniquement) :*\n` +
                      `┃ ▸ ${prefix}gc color red\n` +
                      `┃ ▸ ${prefix}gc color blue\n` +
                      `┃ ▸ ${prefix}gc color reset\n` +
                      `┃\n` +
                      `┃ Couleur par défaut : 🟣 Violet\n` +
                      `╰━━━━━━━━━━━━━━━━━━━━━\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, { text: '📢 _Publication du statut texte de groupe…_' }, { quoted: message });

        try {
            await postGroupStatus(sock, chatId, {
                text,
                _bgColor: getColor(chatId),
            });
            return sock.sendMessage(chatId, {
                text: `✅ *Statut texte de groupe publié !*\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
            }, { quoted: message });
        } catch (err) {
            console.error('[gc/text]', err.message);
            return sock.sendMessage(chatId, {
                text: `❌ Échec de la publication du statut texte.\n\n_${err.message}_\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
            }, { quoted: message });
        }
    }

    // ── IMAGE / STICKER ───────────────────────────────────────────────────────
    if (mtype === 'imageMessage' || mtype === 'stickerMessage') {
        await sock.sendMessage(chatId, { text: '📢 _Publication du statut image de groupe…_' }, { quoted: message });

        let buf;
        try {
            buf = await downloadQuotedMedia(quotedMsg, mtype);
        } catch (err) {
            return sock.sendMessage(chatId, { text: `❌ Échec du téléchargement de l'image.\n\n_${err.message}_` }, { quoted: message });
        }
        if (!buf) return sock.sendMessage(chatId, { text: "❌ Impossible de lire les données de l'image." }, { quoted: message });

        try {
            await postGroupStatus(sock, chatId, { image: buf, caption: text || '' });
            return sock.sendMessage(chatId, { text: `✅ *Statut image de groupe publié !*\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡` }, { quoted: message });
        } catch (err) {
            console.error('[gc/image]', err.message);
            return sock.sendMessage(chatId, {
                text: `❌ Échec de la publication du statut image.\n\n_${err.message}_\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
            }, { quoted: message });
        }
    }

    // ── VIDEO ─────────────────────────────────────────────────────────────────
    if (mtype === 'videoMessage') {
        await sock.sendMessage(chatId, { text: '📢 _Publication du statut vidéo de groupe…_' }, { quoted: message });

        let buf;
        try {
            buf = await downloadQuotedMedia(quotedMsg, mtype);
        } catch (err) {
            return sock.sendMessage(chatId, { text: `❌ Échec du téléchargement de la vidéo.\n\n_${err.message}_` }, { quoted: message });
        }
        if (!buf) return sock.sendMessage(chatId, { text: '❌ Impossible de lire les données de la vidéo.' }, { quoted: message });

        try {
            await postGroupStatus(sock, chatId, { video: buf, caption: text || '' });
            return sock.sendMessage(chatId, { text: `✅ *Statut vidéo de groupe publié !*\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡` }, { quoted: message });
        } catch (err) {
            console.error('[gc/video]', err.message);
            return sock.sendMessage(chatId, {
                text: `❌ Échec de la publication du statut vidéo.\n\n_${err.message}_\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
            }, { quoted: message });
        }
    }

    // ── AUDIO ─────────────────────────────────────────────────────────────────
    if (mtype === 'audioMessage') {
        await sock.sendMessage(chatId, { text: '📢 _Publication du statut audio de groupe…_' }, { quoted: message });

        let buf;
        try {
            buf = await downloadQuotedMedia(quotedMsg, mtype);
        } catch (err) {
            return sock.sendMessage(chatId, { text: `❌ Échec du téléchargement de l'audio.\n\n_${err.message}_` }, { quoted: message });
        }
        if (!buf) return sock.sendMessage(chatId, { text: "❌ Impossible de lire les données de l'audio." }, { quoted: message });

        const vn = await toVoiceNote(buf);

        try {
            await postGroupStatus(sock, chatId, {
                audio: vn, mimetype: 'audio/ogg; codecs=opus', ptt: true,
            });
            return sock.sendMessage(chatId, { text: `✅ *Statut audio de groupe publié !*\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡` }, { quoted: message });
        } catch (err) {
            console.error('[gc/audio]', err.message);
            return sock.sendMessage(chatId, {
                text: `❌ Échec de la publication du statut audio.\n\n_${err.message}_\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡`
            }, { quoted: message });
        }
    }

    return sock.sendMessage(chatId, {
        text: '❌ Type de média non pris en charge. Répondez à un message *image*, *vidéo* ou *audio*.\n\n_𝐃𝐈𝐏𝐏𝐄𝐑_ ⚡'
    }, { quoted: message });
}

// ── Export au format attendu par utils/commandLoader.js ───────────────────────
// [ADAPTATION EXPORT] Le fichier source exportait directement la fonction
// (module.exports = gcstatusCommand). DIPPER attend un objet avec
// { name, aliases, execute(sock, msg, args, extra) }. Le wrapper ci-dessous
// se contente de faire correspondre les paramètres — AUCUNE logique interne
// de gcstatusCommand n'est modifiée.
//
// [SIGNALEMENT] Aucun flag ownerOnly/groupOnly/adminOnly n'est déclaré ici
// volontairement : les ajouter ferait que le pipeline central de DIPPER
// (handler.js lignes ~1690-1745) appliquerait SA PROPRE vérification avant
// même d'atteindre checkAuth() ci-dessus — ce qui changerait les permissions
// par rapport au code source (ex: bloquerait un sudo non-admin que le code
// original autorise explicitement). Le code original reste donc seul
// responsable de l'autorisation, exactement comme fourni.
module.exports = {
    name: 'gc',
    aliases: [],
    category: '🛡️ Group',
    description: '『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴘᴜʙʟɪᴇ ᴜɴ sᴛᴀᴛᴜᴛ ᴅᴇ ɢʀᴏᴜᴘᴇ (ᴛᴇxᴛᴇ/ɪᴍᴀɢᴇ/ᴠɪᴅᴇ́ᴏ/ᴀᴜᴅɪᴏ)',
    usage: `${prefix}gc <texte> | ${prefix}gc color <nom|reset> | (répondre à un média) ${prefix}gc`,

    async execute(sock, msg, args, extra) {
        return gcstatusCommand(sock, extra.from, extra.sender, msg);
    },
};
