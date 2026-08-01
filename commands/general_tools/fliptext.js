/**
 * FlipText Command — 𝐃𝐚𝐫𝐤 Edition
 * .fliptext <texte>  → inverse et retourne le texte (upside-down)
 */
const config = require('../../config.js');
const SC = t => {
  const n='abcdefghijklmnopqrstuvwxyz0123456789'; const s='ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split('').map(c=>{const i=n.indexOf(c);return i!==-1?s[i]:c;}).join('');
};

const FLIP_MAP = {
  a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',
  n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z',
  A:'∀',B:'ᗺ',C:'Ɔ',D:'ᗡ',E:'Ǝ',F:'Ⅎ',G:'⅁',H:'H',I:'I',J:'ſ',K:'ꓘ',L:'⅂',
  M:'W',N:'N',O:'O',P:'Ԁ',Q:'Ό',R:'ᴚ',S:'S',T:'⊥',U:'∩',V:'Λ',W:'M',X:'X',Y:'⅄',Z:'Z',
  '0':'0','1':'Ɩ','2':'ᄅ','3':'Ɛ','4':'ㄣ','5':'ϛ','6':'9','7':'ㄥ','8':'8','9':'6',
  '!':'¡','?':'¿',',':'\'','\'':',','.':'˙','(':')',')':'(','[':']',']':'[','{':'}','}':'{',
  '<':'>','>':'<','"':'„','&':'⅋'
};

function flipText(text) {
  return text.split('').map(c => FLIP_MAP[c] || c).reverse().join('');
}

module.exports = {
  name:'fliptext', aliases:['flip','inverser','upsidedown','renverser'],
  category: '🛠️ Outils généraux',
  description:'『 𝐃𝐈𝐏𝐏𝐄𝐑 』➪ ɪɴᴠᴇʀsᴇ ᴇᴛ ʀᴇᴛᴏᴜʀɴᴇ ʟᴇ ᴛᴇxᴛᴇ 🙃',
  usage:`${config.prefix||'.'}fliptext <texte>`,

  async execute(sock, msg, args, extra) {
    const { reply, phrases } = extra;
    try {
    if (!args.length) {
      return reply(`*📌 ᴜsᴀɢᴇ :* \`${config.prefix||'.'}fliptext <texte>\`\n\n${phrases.footer()}`);
    }
    const text    = args.join(' ');
    const flipped = flipText(text);
    await reply(
      `╭╼≪• *🙃 ${SC('texte retourné')}* •≫╾╮\n` +
      `┃\n` +
      `┃ 📝 *${SC('original')} :* ${text}\n` +
      `┃ 🔄 *${SC('retourné')} :* ${flipped}\n` +
      `┃\n` +
      `╰━━━━━━━━━━━━━━━━━╯\n\n${phrases.footer()}`
    );
    } catch (err) {
      console.error('[fliptext] Erreur:', err.message);
      try { await reply(`❌ Erreur : ${err.message}`); } catch (_) {}
    }
  }
};
