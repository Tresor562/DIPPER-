'use strict';

const FALLBACK_QUIZ=[
  {q:'Quelle planète est surnommée la planète rouge ?',a:['mars'],difficulty:'easy'},
  {q:'Quelle est la capitale du Japon ?',a:['tokyo'],difficulty:'easy'},
  {q:'Quel langage s’exécute nativement dans la majorité des navigateurs ?',a:['javascript','js'],difficulty:'easy'},
  {q:'Dans Naruto, quel village Naruto veut-il diriger comme Hokage ?',a:['konoha'],difficulty:'easy'},
  {q:'Dans One Piece, qui est le capitaine des Mugiwara ?',a:['luffy','monkey d luffy'],difficulty:'easy'},
  {q:'Dans Dragon Ball, de quelle race est Goku ?',a:['saiyan','saiyen'],difficulty:'easy'},
  {q:'Dans Death Note, quel est le prénom de Yagami ?',a:['light'],difficulty:'easy'},
  {q:'Dans Demon Slayer, comment s’appelle la sœur de Tanjiro ?',a:['nezuko','nezuko kamado'],difficulty:'easy'},
  {q:'Dans Jujutsu Kaisen, quel professeur possède les Six Yeux ?',a:['gojo','satoru gojo'],difficulty:'easy'},
  {q:'Combien font 12 × 8 ?',a:['96'],difficulty:'easy'}
];

function stripFence(s=''){return String(s).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();}
function normalizeQuestion(x){if(!x||typeof x!=='object')return null;const q=String(x.q||x.question||'').trim().slice(0,500);let a=x.a||x.answers||x.answer||[];if(!Array.isArray(a))a=[a];a=[...new Set(a.map(v=>String(v).trim().toLowerCase()).filter(Boolean))].slice(0,8);if(!q||!a.length)return null;return{q,a,difficulty:['easy','medium','hard'].includes(x.difficulty)?x.difficulty:'medium',explanation:String(x.explanation||'').slice(0,800)};}
function validateQuestions(items,count){const seen=new Set(),out=[];for(const item of Array.isArray(items)?items:[]){const q=normalizeQuestion(item);if(!q)continue;const k=q.q.toLowerCase().replace(/\s+/g,' ');if(seen.has(k))continue;seen.add(k);out.push(q);if(out.length>=count)break;}return out;}

async function generateQuizContent(ai,spec){
  const count=Math.max(1,Math.min(100,spec.rounds?.length||10));
  if(ai?.complete){
    try{
      const result=await ai.complete({mode:'deep',messages:[
        {role:'system',content:'Tu conçois un quiz pour un grand groupe WhatsApp. Retourne UNIQUEMENT un tableau JSON. Chaque élément: {"q":"question claire","a":["réponse acceptable"],"difficulty":"easy|medium|hard","explanation":"courte explication"}. Questions factuelles, non ambiguës, réponses vérifiables, aucune question dupliquée. Adapte progressivement la difficulté.'},
        {role:'user',content:`Thème: ${spec.theme}. Nombre de questions: ${count}. Description du jeu: ${String(spec.description||'').slice(0,1500)}`}
      ]});
      const parsed=JSON.parse(stripFence(result?.text||''));const valid=validateQuestions(parsed,count);if(valid.length>=Math.min(3,count))return{source:result.provider||'ai',questions:valid};
    }catch(_){}
  }
  const pool=FALLBACK_QUIZ.filter(q=>spec.theme==='général'||/anime|naruto|one piece|dragon ball|manga/i.test(spec.theme)?true:!/naruto|one piece|dragon ball|death note|demon|jujutsu/i.test(q.q));
  const questions=[];for(let i=0;i<count;i++)questions.push({...pool[i%pool.length]});return{source:'local-fallback',questions};
}

async function enrichGameSpec(ai,spec){
  if(spec.gameType==='quiz'){const content=await generateQuizContent(ai,spec);return{...spec,metadata:{...(spec.metadata||{}),contentSource:content.source,questions:content.questions},rounds:spec.rounds.map((r,i)=>({...r,prompt:content.questions[i]?.q||r.name,answers:content.questions[i]?.a||[],explanation:content.questions[i]?.explanation||''}))};}
  return spec;
}

module.exports={generateQuizContent,enrichGameSpec,validateQuestions,normalizeQuestion};
