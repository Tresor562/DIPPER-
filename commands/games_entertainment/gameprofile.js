'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const block=require('../../utils/gameCenterWhatsappBlock7');
const prefix=config.prefix||'.';
const sep=()=>`\n\n${styleManager.getPhrases().footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;

module.exports={
  name:'gameprofile',aliases:['profiljeu','profilegame','gprofile'],category:'🎮 Jeux & Fun',
  description:'Afficher le profil persistant Game Center',usage:`${prefix}gameprofile [@membre]`,
  groupOnly:false,adminOnly:false,botAdminNeeded:false,
  execute(sock,msg,args,extra){ return block.handleSubcommand(sock,msg,['profile',...args],extra,{prefix,sep,tag}); }
};
