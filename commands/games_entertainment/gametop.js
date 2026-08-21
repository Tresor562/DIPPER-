'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const block=require('../../utils/gameCenterWhatsappBlock7');
const prefix=config.prefix||'.';
const sep=()=>`\n\n${styleManager.getPhrases().footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;

module.exports={
  name:'gametop',aliases:['topgames','topjeu'],category:'🎮 Jeux & Fun',
  description:'Classement Game Center limité aux membres du groupe',usage:`${prefix}gametop [xp|coins|wins|fish]`,
  groupOnly:true,adminOnly:false,botAdminNeeded:false,
  execute(sock,msg,args,extra){ return block.handleSubcommand(sock,msg,['top',...args],extra,{prefix,sep,tag}); }
};
