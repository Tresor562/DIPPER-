'use strict';

const config = require('../../config');
const database = require('../../database');
const prefix = config.prefix || '.';

function cleanJid(jid){return String(jid||'').split(':')[0].replace('@c.us','@s.whatsapp.net')}
function numberOf(jid){return String(jid||'').split('@')[0].split(':')[0].replace(/\D/g,'')}
function context(msg){return msg.message?.extendedTextMessage?.contextInfo||{}}
function explicitTarget(msg,args){const ctx=context(msg);if(ctx.mentionedJid?.length)return true;if(ctx.quotedMessage&&ctx.participant)return true;return String(args?.[0]||'').replace(/\D/g,'').length>=7}
function targetFromMessage(msg,args,fallback){const ctx=context(msg);if(ctx.mentionedJid?.length)return ctx.mentionedJid[0];if(ctx.quotedMessage&&ctx.participant)return ctx.participant;const num=String(args?.[0]||'').replace(/\D/g,'');if(num.length>=7)return `${num}@s.whatsapp.net`;return fallback}
function participantFor(meta,targetJid){if(!meta?.participants?.length||!targetJid)return null;const targetNum=numberOf(targetJid);return meta.participants.find(p=>[p?.id,p?.phoneNumber,p?.lid,p?.jid,p?.userJid].filter(Boolean).some(id=>numberOf(id)===targetNum||cleanJid(id)===cleanJid(targetJid)))||null}
function observedName(obj){for(const v of [obj?.notify,obj?.name,obj?.displayName,obj?.pushName,obj?.verifiedName,obj?.verified_name,obj?.businessName]){if(typeof v==='string'&&v.trim())return v.trim()}return null}
function readCachedName(...jids){for(const jid of jids.filter(Boolean)){try{const u=database.getUser(jid)||{};const n=observedName(u);if(n)return n}catch(_){}}return null}

module.exports={
  name:'getname',aliases:['accountname','waname','displayname','nomcompte'],category:'🛠️ Outils généraux',
  description:'Récupère le nom WhatsApp connu/visible d’un compte.',usage:`${prefix}getname [@mention | réponse | numéro]`,
  async execute(sock,msg,args,extra){
    const {reply,from,sender,groupMetadata,phrases}=extra;
    const isExplicit=explicitTarget(msg,args);
    const targetJid=targetFromMessage(msg,args,sender);
    if(!targetJid)return reply(`⚠️ Utilise ${prefix}getname @personne ou réponds à son message.`);
    const targetNum=numberOf(targetJid);let displayName=null,username=null,source=null;

    // Sans cible explicite, la commande parle forcément de l'expéditeur du message.
    // Les sessions MD utilisent souvent un LID ici : comparer les numéros cassait
    // donc getname alors que le même msg.pushName était déjà visible au menu.
    if(!isExplicit&&typeof msg.pushName==='string'&&msg.pushName.trim()){
      displayName=msg.pushName.trim();source='message WhatsApp';
      for(const jid of [sender,targetJid]){try{database.updateUser(jid,{displayName,displayNameUpdatedAt:Date.now()})}catch(_){}}
    }

    let meta=groupMetadata;
    if(from?.endsWith('@g.us')&&!meta){try{meta=await sock.groupMetadata(from)}catch(_){}}
    const participant=participantFor(meta,targetJid);
    if(!displayName){displayName=observedName(participant);if(displayName)source='membre du groupe'}
    username=participant?.username||participant?.participantUsername||null;

    if(!displayName){
      displayName=readCachedName(targetJid,participant?.id,participant?.phoneNumber,participant?.lid,sender);
      if(displayName)source='nom observé par le bot';
    }
    if(!displayName&&numberOf(sock.user?.id)===targetNum&&sock.user?.name){displayName=String(sock.user.name).trim();source='compte connecté'}

    if(!displayName&&!username)return reply(`👤 *Nom du compte*\n\n📞 Numéro : +${targetNum||'inconnu'}\n⚠️ Aucun nom visible n’a encore été observé pour ce compte.\n\n${phrases?.footer?.()||''}`);
    const lines=['👤 *Nom du compte WhatsApp*','',`📞 *Numéro :* +${targetNum||'inconnu'}`];
    if(displayName)lines.push(`🏷️ *Nom affiché :* ${displayName}`);if(username)lines.push(`🪪 *Username WhatsApp :* @${String(username).replace(/^@/,'')}`);if(source)lines.push(`🔎 *Source :* ${source}`);lines.push('',phrases?.footer?.()||'');
    try{return await sock.sendMessage(from,{text:lines.join('\n'),mentions:[targetJid]},from?.endsWith('@g.us')?{quoted:msg}:undefined)}catch(_){return reply(lines.join('\n'))}
  }
};
