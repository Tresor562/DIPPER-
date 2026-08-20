'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {loadCommands}=require('../../utils/commandLoader');
const {getTheme}=require('../../utils/styleCatalog');
const {getStyleImageBuffer}=require('../../utils/styleMedia');
const {sendCarousel,newsletterContext,urlButton}=require('../../utils/whatsappCarousel');

const PAGE_SIZE=8;
const CATEGORY_ORDER=['🤖 IA','📥 Téléchargements','⚙️ Gestion de groupe','🛠️ Outils généraux','🎮 Jeux & Fun','🛡️ Protections','🌸 Anime','🔍 Recherche','👑 Owner','🔧 Configuration'];
const TG='https://t.me/the_big_dipper_bot';
function socials(){const s=config.social||{};return {channel:s.whatsappChannel||'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V',support:s.whatsappGroup||'https://chat.whatsapp.com/IFUx2XwT55o6yHqmaKf3DW',telegram:s.telegram||TG};}
function groupCommands(){const map=loadCommands();const cats={};map.forEach((cmd,key)=>{if(!cmd||cmd.name!==key)return;const cat=cmd.category||'🛠️ Outils généraux';(cats[cat]||(cats[cat]=[])).push(cmd);});for(const list of Object.values(cats))list.sort((a,b)=>String(a.name).localeCompare(String(b.name)));return cats;}
function orderedNames(cats){const known=CATEGORY_ORDER.filter(c=>cats[c]);const rest=Object.keys(cats).filter(c=>!CATEGORY_ORDER.includes(c)).sort();return [...known,...rest];}
function chunks(values,size){const out=[];for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));return out;}
module.exports={name:'allmenu',aliases:['menuall','allcommands','fullmenu'],category:'🛠️ Outils généraux',description:'Toutes les catégories sous forme de carrousel horizontal.',usage:`${config.prefix||'.'}allmenu`,async execute(sock,msg,args,extra){const style=styleManager.getStyle();const theme=getTheme(style);const cats=groupCommands();const names=orderedNames(cats);const links=socials();const pages=chunks(names,PAGE_SIZE);const total=Object.values(cats).reduce((n,a)=>n+a.length,0);const contextInfo=newsletterContext(config,theme.botName);for(let page=0;page<pages.length;page++){const pageNames=pages[page];const media=await Promise.all(pageNames.map(()=>getStyleImageBuffer(style).catch(()=>null)));const cards=pageNames.map((name,i)=>{const list=cats[name]||[];const sample=list.slice(0,8).map(c=>`• ${(config.prefix||'.')}${c.name}`).join('\n');const more=list.length>8?`\n… +${list.length-8} autres`:'';return {title:name,body:`${theme.mark} ${list.length} commandes\n\n${sample}${more}`,footer:`${theme.botName} • ${page*PAGE_SIZE+i+1}/${names.length}`,imageBuffer:media[i],buttons:[urlButton('📢 Chaîne',links.channel),urlButton('💬 Support',links.support),urlButton('✈️ Telegram',links.telegram)]};});const fallback=pageNames.map((name,i)=>`${String(page*PAGE_SIZE+i+1).padStart(2,'0')} ┊ *${name}* — ${(cats[name]||[]).length} commandes`).join('\n');await sendCarousel({sock,jid:extra.from,quoted:page===0?msg:undefined,cards,body:`📚 *ALL MENU* — page ${page+1}/${pages.length}\n${theme.botName}\nGlisse vers la gauche pour explorer les catégories.`,footer:`${total} commandes`,contextInfo,fallbackText:`📚 *ALL MENU* — page ${page+1}/${pages.length}\n\n${fallback}\n\nUtilise ${(config.prefix||'.')}menu pour naviguer par numéro.`});}}};
