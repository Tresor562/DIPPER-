'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {MAX_STYLE,THEMES,getTheme}=require('../../utils/styleCatalog');
const {getStyleImageBuffer}=require('../../utils/styleMedia');
const {sendCarousel,newsletterContext,urlButton}=require('../../utils/whatsappCarousel');
const TG='https://t.me/the_big_dipper_bot';
const PAGE_SIZE=8;
function socials(){const s=config.social||{};return {channel:s.whatsappChannel||'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V',support:s.whatsappGroup||'https://chat.whatsapp.com/IFUx2XwT55o6yHqmaKf3DW',telegram:s.telegram||TG};}
function preview(t){return `${t.separator}\n${t.botName}\n${t.separator}\n${t.mark} GENERAL\n${t.accent} DOWNLOAD\n${t.mark} ANIME\n\n_${t.tagline}_`;}
function chunks(values,size){const out=[];for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));return out;}
module.exports={name:'stylelist',aliases:['styles','liststyles','styleslist','themes','themelist'],category:'🛠️ Outils généraux',description:'Catalogue horizontal des styles disponibles.',usage:`${config.prefix||'.'}stylelist`,async execute(sock,msg,args,extra){const active=styleManager.getStyle();const links=socials();const ids=Array.from({length:MAX_STYLE+1},(_,i)=>i);const pages=chunks(ids,PAGE_SIZE);const contextInfo=newsletterContext(config,getTheme(active).botName);for(let page=0;page<pages.length;page++){const pageIds=pages[page];const media=await Promise.all(pageIds.map(id=>getStyleImageBuffer(id).catch(()=>null)));const cards=pageIds.map((id,i)=>{const t=getTheme(id);return {title:`${id===active?'✓ ':''}${String(id).padStart(2,'0')} · ${t.name}`,body:`${preview(t)}\n\n${id===active?'✓ STYLE ACTIF':`Pour activer : ${(config.prefix||'.')}style${id}`}`,footer:`STYLE ${id}/${MAX_STYLE}`,imageBuffer:media[i],buttons:[urlButton('📢 Chaîne',links.channel),urlButton('💬 Support',links.support),urlButton('✈️ Telegram',links.telegram)]};});const fallback=pageIds.map(id=>{const t=THEMES[id];return `${id===active?'✓':'○'} *${id}. ${t.name}* — ${(config.prefix||'.')}style${id}`;}).join('\n');await sendCarousel({sock,jid:extra.from,quoted:page===0?msg:undefined,cards,body:`🎨 *STYLE LIST* — page ${page+1}/${pages.length}\nGlisse vers la gauche.`,footer:`Actif : ${getTheme(active).name}`,contextInfo,fallbackText:`🎨 *STYLE LIST* — page ${page+1}/${pages.length}\n\n${fallback}`});}}};
