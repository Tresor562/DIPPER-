'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const ui=require('../../utils/gameCenterWhatsappBlock9');
const prefix=config.prefix||'.';
const sep=()=>`\n\n${styleManager.getPhrases().footer()}`;

module.exports={
  name:'rpg',aliases:['adventure','aventure'],category:'🎮 Jeux & Fun',
  description:'RPG persistant : exploration, combats et progression',
  usage:`${prefix}rpg [start|profile|explore|attack|potion|rest|flee]`,
  groupOnly:false,adminOnly:false,botAdminNeeded:false,
  execute(sock,msg,args,extra){return ui.executeRpg(sock,msg,args,extra,{prefix,sep});}
};
