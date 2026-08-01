/**
 * TextToPDF Command — 𝐃𝐈𝐏𝐏𝐄𝐑 Edition
 * .texttopdf <texte>  ou réponse à un message
 * Convertit un texte en fichier PDF et l'envoie.
 *
 * Bibliothèque : pdfkit (npm install pdfkit)
 * Si pdfkit absent → fallback HTML-to-PDF via API externe
 */
const config  = require('../../config.js');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

/**
 * Génère un PDF via pdfkit (local, pas de dépendance réseau)
 * @param {string} text    — texte à convertir
 * @param {string} title   — titre du document
 * @returns {Buffer}       — PDF en mémoire
 */
async function generatePdfLocal(text, title = '𝐃𝐈𝐏𝐏𝐄𝐑 Bot') {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc    = new PDFDocument({ margin: 50 });
    doc.on('data', c => chunks.push(c));
    doc.on('end',  ()=> resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // En-tête
    doc.fontSize(18).text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(new Date().toLocaleString('fr-FR'), { align: 'center' });
    doc.moveDown(2);

    // Contenu (découpage par paragraphes)
    doc.fontSize(11).text(text, { align: 'left', lineGap: 4 });

    // Pied de page
    doc.moveDown(2);
    doc.fontSize(9).fillColor('gray').text('Généré par 𝐃𝐈𝐏𝐏𝐄𝐑 Bot', { align: 'center' });
    doc.end();
  });
}

/**
 * Fallback : HTML to PDF via api.html2pdf.app (gratuit)
 */
async function generatePdfApi(text) {
  const axios  = require('axios');
  const html   = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:30px;font-size:13px;line-height:1.6}pre{white-space:pre-wrap}</style></head><body><pre>${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`;
  const res    = await axios.post('https://api.html2pdf.app/v1/generate', {
    html, apikey: 'demo', media_type: 'print',
  }, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(res.data);
}

module.exports = {
  name:'texttopdf', aliases:['topdf','txt2pdf','pdf','makepdf','textpdf'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ᴄᴏɴᴠᴇʀᴛɪᴛ ᴜɴ ᴛᴇxᴛᴇ ᴇɴ ꜰɪᴄʜɪᴇʀ PDF 📄',
  usage:`${config.prefix||'.'}texttopdf <texte>`,

  async execute(sock, msg, args, extra) {
    const { reply, from, phrases } = extra;

    // Récupération du texte
    let text = args.join(' ');
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (!text && ctx?.quotedMessage?.conversation) {
      text = ctx.quotedMessage.conversation;
    }

    if (!text.trim()) {
      return reply(
        `*📌 ᴜsᴀɢᴇ :* \`${config.prefix||'.'}texttopdf <texte>\`\n` +
        `_ᴏᴜ ʀᴇ́ᴘᴏɴᴅs ᴀ̀ ᴜɴ ᴍᴇssᴀɢᴇ ᴄᴏɴᴛᴇɴᴀɴᴛ ᴅᴜ ᴛᴇxᴛᴇ_\n\n${phrases.footer()}`
      );
    }

    if (text.length > 100000) {
      return reply(`*⚠️ ${SC('texte trop long')} (max 100 000 caractères)*\n\n${phrases.footer()}`);
    }

    await sock.sendMessage(from, { react: { text: '📄', key: msg.key } }).catch(()=>{});

    try {
      let pdfBuffer;
      let method = 'pdfkit';

      try {
        pdfBuffer = await generatePdfLocal(text);
      } catch (_) {
        pdfBuffer = await generatePdfApi(text);
        method    = 'html2pdf.app';
      }

      const timestamp = Date.now();
      await sock.sendMessage(from, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: `dipper_document_${timestamp}.pdf`,
        caption :
          `╭╼≪• *📄 ${SC('document pdf généré')}* •≫╾╮\n` +
          `┃ 📝 *${SC('caractères')}* : ${text.length}\n` +
          `┃ 🛠️ *${SC('méthode')}* : ${method}\n` +
          `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`,
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }).catch(()=>{});
    } catch (err) {
      await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }).catch(()=>{});
      await reply(`*❌ ${SC('erreur pdf')} :* _${err.message}_\n\n${phrases.footer()}`);
    }
  }
};
