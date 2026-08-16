'use strict';

const { analyzeRequest, directive } = require('./cognitivePolicy');
const SENSITIVE_RE=/(api[_ -]?key|token|secret|password|mot de passe|credential|cookie|authorization|session(?:id| key| token)?|bearer\s+)/i;

function lastUser(messages=[]){return [...messages].reverse().find(m=>m?.role==='user')?.content||'';}
function systemOf(messages=[]){return messages.find(m=>m?.role==='system')?.content||'';}
function safeSlice(v,n=6000){return String(v||'').slice(0,n);}
function modeFor(requested,meta){const r=String(requested||'normal').toLowerCase();if(meta.asksAction)return'agent';if(meta.complex&&r==='normal')return'deep';return r;}
function needsPlan(mode,meta){return !meta.sensitive&&(['deep','agent','dual','critical'].includes(mode)||meta.complex||meta.asksAction);}
function needsCritic(mode,meta){return !meta.sensitive&&(['deep','dual','critical'].includes(mode)||meta.complex);}

class GeneralOrchestrator{
  constructor(primary,{localBrain=null}={}){this.primary=primary;this.localBrain=localBrain||primary?.localBrain||null;}
  providerStatus(...args){return typeof this.primary?.providerStatus==='function'?this.primary.providerStatus(...args):null;}
  async _plan(messages,meta){
    const prompt=[
      'Tu es le planificateur interne d’Exaucée. Ne réponds pas directement à l’utilisateur.',
      'Construis un brief opérationnel court avec: objectif réel, livrables, contraintes explicites, contraintes implicites raisonnables, informations connues, informations manquantes, sous-tâches, besoin éventuel de recherche/outils, risques d’erreur, critères de réussite.',
      'Résous les références grâce au contexte fourni. N’invente aucun fait. Ne révèle pas de chaîne de pensée détaillée.',
      directive(meta)
    ].join('\n');
    return this.primary.complete({mode:'deep',messages:[{role:'system',content:prompt},{role:'user',content:safeSlice(lastUser(messages),14000)}]});
  }
  async _critic(messages,candidate,meta){
    const prompt=[
      'Tu es le contrôleur qualité interne d’Exaucée. Analyse la réponse candidate sans t’adresser à l’utilisateur.',
      'Vérifie: réponse à la bonne question, respect des contraintes, exactitude, contradictions, inventions, oublis, contexte conversationnel, naturel du ton, exécution prétendue sans preuve, clarté et utilité.',
      'Réponds UNIQUEMENT en JSON compact: {"ok":true|false,"issues":["..."],"repair":"instruction de correction courte"}.',
      'Si la réponse est déjà bonne, ok=true et repair="".'
    ].join('\n');
    const payload=`Demande utilisateur:\n${safeSlice(lastUser(messages),8000)}\n\nRéponse candidate:\n${safeSlice(candidate,12000)}\n\nDirective cognitive:\n${safeSlice(directive(meta),1800)}`;
    const r=await this.primary.complete({mode:'deep',messages:[{role:'system',content:prompt},{role:'user',content:payload}]});
    try{return JSON.parse(String(r?.text||'').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim());}catch(_){return{ok:true,issues:[],repair:''};}
  }
  async complete(request={}){
    const original=Array.isArray(request.messages)?request.messages:[];
    const user=lastUser(original);
    const meta=analyzeRequest(user);
    const mode=modeFor(request.mode,meta);
    const sensitive=SENSITIVE_RE.test(user)||meta.sensitive;
    const body=original.filter((m,i)=>!(i===0&&m?.role==='system'));
    const messages=[{role:'system',content:[systemOf(original),directive(meta),'Règle générale: traite le dernier message comme objectif principal. Décompose silencieusement les demandes multi-étapes et vérifie que chaque livrable demandé apparaît dans la réponse finale.'].filter(Boolean).join('\n\n')},...body];
    let plan='';
    if(needsPlan(mode,meta)&&!sensitive){try{const p=await this._plan(messages,meta);plan=safeSlice(p?.text,6500);if(plan)messages.splice(1,0,{role:'system',content:`BRIEF INTERNE À SUIVRE SANS LE CITER:\n${plan}`});}catch(_){} }
    let result;
    try{result=await this.primary.complete({...request,messages,mode});}catch(error){result=null;}
    if(!result?.text?.trim()){
      const fb=this.localBrain?.fallback?.(messages)||this.localBrain?.answer?.(messages);
      return{...(fb||{provider:'exaucee-local-fallback',text:'Je n’ai pas de moteur suffisamment fiable pour répondre correctement maintenant.'}),degraded:true,cognitiveMeta:meta,mode};
    }
    let text=String(result.text).trim();
    let repaired=false;
    if(needsCritic(mode,meta)&&!sensitive){
      try{
        const critique=await this._critic(messages,text,meta);
        if(critique&&critique.ok===false&&String(critique.repair||'').trim()){
          const repairMessages=[...messages,{role:'assistant',content:text},{role:'system',content:`Corrige la réponse précédente avant envoi. Problèmes détectés: ${(critique.issues||[]).slice(0,8).join(' | ')}. Instruction: ${safeSlice(critique.repair,1800)}. Donne seulement la nouvelle réponse finale, sans mentionner la révision interne.`}];
          const fixed=await this.primary.complete({messages:repairMessages,mode:'deep'});
          if(fixed?.text?.trim()){text=String(fixed.text).trim();repaired=true;result={...fixed,provider:`${result.provider||'ai'}+critic`};}
        }
      }catch(_){}
    }
    return{...result,text,mode,cognitiveMeta:meta,orchestration:{planned:Boolean(plan),critic:needsCritic(mode,meta)&&!sensitive,repaired}};
  }
}

module.exports={GeneralOrchestrator,modeFor,needsPlan,needsCritic};
