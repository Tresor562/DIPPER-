'use strict';

const config = require('../../config');
const styleManager = require('../../utils/styleManager');
const { THEMES } = require('../../utils/styleCatalog');
const { findParticipant } = require('../../utils/jidHelpers');
const { engine } = require('../../utils/gameCenterEngine');
const { MAX_ANON_TEXT } = require('../../utils/gameCenterBlock6');

const prefix=config.prefix||'.';
const footer=()=>styleManager.getPhrases().footer();
const sep=()=>`\n\n${footer()}`;
function theme(){ return THEMES[styleManager.getStyle()] || THEMES[0]; }
function banner(label,emoji='🕶️'){ return `${emoji} *${theme().botName} — ${label}*`; }
function parse(args=[]){
  const ref=String(args[0]||'').replace(/^#/,'').trim();
  const text=args.slice(1).join(' ').trim();
  return {ref,text};
}
function errorText(result){
  if(result?.error==='not-found')return '❌ Boîte anonyme introuvable ou déjà fermée.';
  if(result?.error==='short')return '❌ La question est trop courte.';
  if(result?.error==='long')return `❌ La question dépasse la limite de *${result.max||MAX_ANON_TEXT} caractères*.`;
  if(result?.error==='links')return '🚫 Les liens ne sont pas autorisés dans les questions anonymes.';
  if(result?.error==='rate')return `⏳ Limite atteinte : *${result.limit||5} questions par heure* pour cette boîte.`;
  if(result?.error==='duplicate')return '♻️ Cette même question a déjà été envoyée récemment.';
  return '❌ Impossible d’envoyer cette question anonyme.';
}

module.exports={
  name:'anon',
  aliases:['anonymous','anonyme','questionanonyme','qanonyme'],
  category:'🎮 Jeux & Fun',
  description:'Envoyer en privé une question anonyme vers une boîte Game Center',
  usage:`${prefix}anon #ID votre question`,
  groupOnly:false,adminOnly:false,botAdminNeeded:false,
  async execute(sock,msg,args,extra){
    if(extra.isGroup){
      return extra.reply([
        banner('QUESTION ANONYME'),'',
        'Pour protéger ton identité, cette commande doit être envoyée *en privé au bot*.',
        `Exemple : *${prefix}anon #ABC123 ta question*`
      ].join('\n')+sep());
    }

    const {ref,text}=parse(args);
    if(!ref||!text){
      return extra.reply([
        banner('QUESTION ANONYME'),'',
        `Utilisation : *${prefix}anon #ID votre question*`,
        'L’ID est affiché dans le groupe quand un admin ouvre la boîte anonyme.'
      ].join('\n')+sep());
    }

    const inbox=engine.findAnonymousInbox(ref);
    if(!inbox)return extra.reply(`${errorText({error:'not-found'})}${sep()}`);

    let metadata;
    try {
      metadata=await sock.groupMetadata(inbox.chatId);
    } catch(_){
      return extra.reply(`⚠️ Je n’arrive pas à vérifier ton appartenance au groupe pour le moment.${sep()}`);
    }
    const member=findParticipant(metadata?.participants||[],extra.sender);
    if(!member){
      return extra.reply(`🔒 Cette boîte anonyme est réservée aux membres du groupe concerné.${sep()}`);
    }

    const result=engine.submitAnonymousQuestion(inbox.alias,extra.sender,text);
    if(!result.ok)return extra.reply(`${errorText(result)}${sep()}`);

    try {
      await sock.sendMessage(result.chatId,{
        text:[
          banner('QUESTION ANONYME'),'',
          `💬 *${result.question}*`,'',
          `🆔 Question : *${result.questionId}*`,
          '🔐 Auteur masqué au groupe.'
        ].join('\n')+sep()
      });
    } catch(err){
      engine.rollbackAnonymousQuestion(inbox.alias,result.rateToken);
      return extra.reply(`⚠️ L’envoi au groupe a échoué. Rien n’a été comptabilisé ; tu peux réessayer.${sep()}`);
    }

    return extra.reply(`${banner('QUESTION ENVOYÉE','✅')}\n\nTa question a été publiée sans afficher ton identité.\nID : *${result.questionId}*${sep()}`);
  },
  parse,errorText
};
