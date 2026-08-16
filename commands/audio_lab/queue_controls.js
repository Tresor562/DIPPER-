'use strict';
const dj=require('../../utils/audioDjEngine');
const CAT='🎚️ AUDIO LAB / DJ TOOLS';
const KEY=Symbol.for('dipper.audioDj.pausePatch');
if(!globalThis[KEY]){
  const paused=new Set(),origEnqueue=dj.enqueue.bind(dj),origProcess=dj.processQueue.bind(dj);
  dj.enqueue=async function(chat,msg){if(paused.has(chat))throw new Error('La file DJ est en pause. Utilise `.resumequeue` avant d’ajouter une piste.');return origEnqueue(chat,msg)};
  dj.processQueue=async function(chat,mode,options){if(paused.has(chat))throw new Error('La file DJ est en pause. Utilise `.resumequeue` avant le mix.');return origProcess(chat,mode,options)};
  globalThis[KEY]={paused};
}
const state=globalThis[KEY];
module.exports=[
{name:'pausequeue',aliases:['pauseaudio','pauseq'],category:CAT,description:'Mettre la file DJ en pause',usage:'.pausequeue',async execute(sock,msg,args,extra){state.paused.add(extra.from);await extra.reply('⏸️ File DJ mise en pause. Les pistes restent conservées.');}},
{name:'resumequeue',aliases:['resumeaudio','resumeq'],category:CAT,description:'Reprendre la file DJ',usage:'.resumequeue',async execute(sock,msg,args,extra){state.paused.delete(extra.from);await extra.reply('▶️ File DJ reprise.');}},
{name:'queuestatus',aliases:['djstatus'],category:CAT,description:'État de la file DJ',usage:'.queuestatus',async execute(sock,msg,args,extra){const q=dj.queueInfo(extra.from);await extra.reply(`🎚️ *État file DJ*\n${state.paused.has(extra.from)?'⏸️ En pause':'▶️ Active'}\n🎵 ${q.length} piste(s)`);}}
];