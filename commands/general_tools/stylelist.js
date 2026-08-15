'use strict';
const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {renderResponse}=require('../../utils/responseStyle');
module.exports={name:'stylelist',aliases:['styles','liststyles','styleslist'],category:'🛠️ Outils généraux',description:'Affiche les 21 styles disponibles et le style actif.',usage:`${config.prefix||'.'}stylelist`,async execute(sock,msg,args,extra){const active=Number(styleManager.getStyle());const lines=Object.entries(styleManager.STYLE_NAMES).map(([id,name])=>`${Number(id)===active?'➤':'•'} style${id} — ${name}${Number(id)===active?'  ✅':''}`).join('\n');return extra.reply(renderResponse({type:'list',title:'STYLE LIST',body:lines,details:`Style actif : style${active} — ${styleManager.getStyleName(active)}\nUtilise ${config.prefix||'.'}style<numéro> pour changer.`,footer:true,style:active}));}};
