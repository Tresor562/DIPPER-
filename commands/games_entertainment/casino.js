'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const casinoUi=require('../../utils/gameCenterWhatsappBlock8');
const prefix=config.prefix||'.';
const sep=()=>`\n\n${styleManager.getPhrases().footer()}`;

module.exports={
  name:'casino',aliases:['virtualcasino','arcadecasino'],category:'🎮 Jeux & Fun',
  description:'Arcade casino uniquement en Dipper Coins virtuels',
  usage:`${prefix}casino [slots|roulette|blackjack|hit|stand|abort]`,
  groupOnly:false,adminOnly:false,botAdminNeeded:false,
  execute(sock,msg,args,extra){ return casinoUi.executeCasino(sock,msg,args,extra,{prefix,sep}); }
};
