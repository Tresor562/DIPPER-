'use strict';

const config=require('../../config');
const styleManager=require('../../utils/styleManager');
const {engine}=require('../../utils/gameCenterEngine');
const {makeZoomBuffer}=require('../../utils/gameCenterObjectZoom');
require('../../utils/gameCenterObjectZoom');
const {imageMessageFrom,downloadImageBuffer,MAX_SOURCE_BYTES}=require('../../utils/gameCenterObjectMedia');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
const tag=id=>`@${String(id||'').split('@')[0]}`;
const refFrom=args=>String((args||[]).find(x=>String(x).startsWith('#'))||'').replace(/^#/,'')||null;

module.exports={
  name:'objectzoom',aliases:['zoomobject','guessobject','objetzoom'],category:'🎮 Jeux & Fun',
  description:'Devine un objet à partir d’un zoom créé localement depuis une image',
  usage:`${prefix}objectzoom start <réponse> (avec/réponse à une image) | guess <réponse> [#id] | status [#id] | stop [#id]`,
  groupOnly:true,adminOnly:false,botAdminNeeded:false,
  async execute(sock,msg,args,extra){
    const from=extra.from,sender=extra.sender,sub=String(args[0]||'').toLowerCase();
    if(!sub||sub==='help'||sub==='menu')return extra.reply([
      '🔎 *DEVINE L’OBJET ZOOMÉ*','',
      `1. Envoie une image avec la légende *${prefix}objectzoom start téléphone*`,
      `   ou réponds à une image avec cette commande.`,
      `2. Les joueurs répondent avec *${prefix}objectzoom guess téléphone*.`,
      '',`Image source max : *${Math.floor(MAX_SOURCE_BYTES/1024/1024)} Mo*.`
    ].join('\n')+sep());
    if(sub==='start'){
      const answer=args.slice(1).join(' ').trim();
      if(answer.length<2)return extra.reply(`❌ Donne la réponse après *start*.${sep()}`);
      const imageMsg=imageMessageFrom(msg);
      if(!imageMsg)return extra.reply(`❌ Envoie cette commande avec une image ou en réponse à une image.${sep()}`);
      try{
        const source=await downloadImageBuffer(imageMsg);
        const zoom=await makeZoomBuffer(source);
        const g=engine.startObjectZoom(from,sender,answer);
        if(g.error)return extra.reply(`⚠️ Une partie Objet zoomé existe déjà ou la limite de parties est atteinte.${sep()}`);
        return sock.sendMessage(from,{image:zoom,caption:`🔎 *DEVINE L’OBJET ZOOMÉ*\n\nQue vois-tu ?\nRéponds avec *${prefix}objectzoom guess ta_réponse*.\n🆔 #${g.alias}${sep()}`},{quoted:msg});
      }catch(error){
        const code=String(error?.message||'');
        if(code.includes('TOO_LARGE'))return extra.reply(`❌ Image trop lourde. Maximum : *${Math.floor(MAX_SOURCE_BYTES/1024/1024)} Mo*.${sep()}`);
        return extra.reply(`❌ Impossible de préparer cette image pour le jeu.${sep()}`);
      }
    }
    if(sub==='status'){
      const g=engine.get(from,refFrom(args),'object-zoom');
      if(!g)return extra.reply(`❌ Aucune partie Objet zoomé active correspondante.${sep()}`);
      return extra.reply(`🔎 *OBJET ZOOMÉ*\n🧩 Tentatives : *${g.totalAttempts||0}*\n🆔 #${g.alias}\n\nLa réponse reste cachée jusqu’à la fin.${sep()}`);
    }
    if(sub==='guess'||sub==='reponse'||sub==='réponse'){
      const ref=refFrom(args);const guess=args.slice(1).filter(x=>!String(x).startsWith('#')).join(' ').trim();
      if(guess.length<2)return extra.reply(`❌ Donne une réponse après *guess*.${sep()}`);
      const r=engine.guessObjectZoom(from,sender,guess,ref);
      if(!r.handled)return extra.reply(`❌ Aucune partie Objet zoomé active correspondante.${sep()}`);
      if(!r.ok&&r.reason==='host')return extra.reply(`🔒 L’hôte connaît déjà la réponse et ne peut pas participer.${sep()}`);
      if(!r.ok&&r.reason==='duplicate')return extra.reply(`♻️ Tu as déjà essayé cette réponse.${sep()}`);
      if(!r.ok&&r.reason==='limit')return extra.reply(`⛔ Tu as atteint la limite d’essais pour cette manche.${sep()}`);
      if(r.won)return sock.sendMessage(from,{text:`🏆 ${tag(sender)} a trouvé l’objet : *${r.answer.toUpperCase()}* !\n+40 XP • +30 Dipper Coins${sep()}`,mentions:[sender]},{quoted:msg});
      return extra.reply(`❌ Pas encore. Il te reste *${r.remaining}* essai(s).${sep()}`);
    }
    if(sub==='stop'){
      const g=engine.get(from,refFrom(args),'object-zoom');
      if(!g)return extra.reply(`❌ Aucune partie Objet zoomé active correspondante.${sep()}`);
      if(sender!==g.by&&!extra.isAdmin&&!extra.isOwner&&!extra.isSupremeOwner)return extra.reply(`🔒 Seul l’hôte ou un admin peut arrêter cette partie.${sep()}`);
      const stopped=engine.stop(from,g.alias);
      return extra.reply(`🛑 Partie Objet zoomé #${stopped.alias} arrêtée. Réponse : *${g.answer}*.${sep()}`);
    }
    return extra.reply(`❓ Utilise *${prefix}objectzoom* pour l’aide.${sep()}`);
  }
};
