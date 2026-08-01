/**
 * Media Uploader Utility - 𝐃𝐚𝐫𝐤 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́
 * Primary  : Catbox.moe
 * Fallback : Uguu.se
 */

const axios = require('axios');
const FormData = require('form-data');
const { fileTypeFromBuffer } = require('file-type');

async function uploadToCatbox(buffer, ext, mime) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('userhash', '');
    form.append('fileToUpload', buffer, {
        filename: `ghostgx-${Date.now()}.${ext}`,
        contentType: mime
    });

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: {
            ...form.getHeaders(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000
    });

    if (response.data && typeof response.data === 'string' && response.data.startsWith('http')) {
        return response.data.trim();
    }
    throw new Error('Catbox invalide : ' + response.data);
}

async function uploadToUguu(buffer, ext, mime) {
    const form = new FormData();
    form.append('files[]', buffer, {
        filename: `ghostgx-${Date.now()}.${ext}`,
        contentType: mime
    });

    const response = await axios.post('https://uguu.se/upload', form, {
        headers: { ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000
    });

    const url = response.data?.files?.[0]?.url;
    if (url) return url;
    throw new Error('Uguu invalide');
}

async function uploadByBuffer(buffer) {
    const type = await fileTypeFromBuffer(buffer);
    const ext  = type?.ext  ?? 'bin';
    const mime = type?.mime ?? 'application/octet-stream';

    // Tentative Catbox → fallback Uguu
    try {
        console.log('[UPLOAD] Tentative Catbox...');
        const url = await uploadToCatbox(buffer, ext, mime);
        console.log('[UPLOAD] Catbox ✅');
        return url;
    } catch (e) {
        console.warn('[UPLOAD] Catbox échoué:', e.message);
    }

    try {
        console.log('[UPLOAD] Tentative Uguu...');
        const url = await uploadToUguu(buffer, ext, mime);
        console.log('[UPLOAD] Uguu ✅');
        return url;
    } catch (e) {
        console.warn('[UPLOAD] Uguu échoué:', e.message);
    }

    throw new Error('TOUTES_SOURCES_UPLOAD_ECHOUEES');
}

module.exports = { uploadByBuffer };