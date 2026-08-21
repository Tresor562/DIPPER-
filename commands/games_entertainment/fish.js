'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const block=require('../../utils/gameCenterWhatsappBlock7');
const prefix=config.prefix||'.';
const sep=()=>`\n\n${styleManager.getPhrases().footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;

module.exports={
  name:'fish',aliases:['fishing','peche','pêche'],category:'🎮 Jeux & Fun',
  description:'Pêcher pour gagner XP et Dipper Coins virtuels',usage:`${prefix}fish`,
  groupOnly:false,adminOnly:false,botAdminNeeded:false,
  execute(sock,msg,args,extra){ return block.handleSubcommand(sock,msg,['fish',...args],extra,{prefix,sep,tag}); }
};
