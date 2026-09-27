'use strict';

const crypto = require('crypto');
const axios = require('axios');
const { ttdl } = require('ruhend-scraper');
const config = require('../../config');
const APIs = require('../../utils/api');
const sessionContext = require('../../utils/sessionContext');
const { renderTikTokCard, sendRichCard } = require('../../utils/nexaiRichUi');

global.__nexaiTikTokCache ||= new Map();
const CACHE = global.__nexaiTikTokCache;
const TTL = 30 * 60 * 1000;
const processed = new Set();

const abs = u => !u ? null : String(u).startsWith('/') ? 'https://www.tikwm.com' + u : String(u);
const domain = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch (_) { return 'tiktok.com'; } };
const sender = msg => String(msg?.key?.participant || msg?.key?.remoteJid || '').split(':')[0];
function prune(){const n=Date.now();for(const[k,v]of CACHE)if(!v||n-v.createdAt>TTL)CACHE.delete(k);}
async function fetchBuffer(url, limit=8*1024*1024){if(!url)return null;try{const r=await axios.get(url,{responseType:'arraybuffer',timeout:12000,maxContentLength:limit,headers:{'User-Agent':'Mozilla/5.0'}});const b=Buffer.from(r.data||[]);return b.length>128?b:null;}catch(_){return null;}}

async function tikwm(url){
  const r=await axios.post('https://www.tikwm.com/api/',new URLSearchParams({url,hd:'1'}).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0'},timeout:30000});
  const d=r.data?.data;if(!d)throw new Error('TikWM sans données');
  return {
    videoUrl:abs(d.hdplay||d.play),
    audioUrl:abs(d.music),
    coverUrl:abs(d.cover||d.origin_cover||d.ai_dynamic_cover),
    meta:{
      author:d.author?.nickname||d.author?.unique_id||'TikTok Creator',
      username:d.author?.unique_id||'',
      description:d.title||'',
      title:d.title||'',
      views:d.play_count||0,likes:d.digg_count||0,comments:d.comment_count||0,
      shares:d.share_count||0,saves:d.collect_count||0,duration:d.duration||0,
      music:d.music_info?.title||d.music_info?.author||'Original sound',
      source:'tiktok.com'
    }
  };
}

async function customApi(url){
  try{
    const r=await APIs.getTikTokDownload(url);
    if(!r?.videoUrl)return null;
    return {videoUrl:r.videoUrl,audioUrl:r.audioUrl||null,coverUrl:r.cover||null,meta:{author:'TikTok Creator',description:r.title||'',title:r.title||'',source:domain(url)}};
  }catch(_){return null;}
}

async function cobalt(url){
  try{
    const r=await axios.post('https://api.cobalt.tools/',{url,downloadMode:'auto',videoQuality:'max',tiktokH265:false},{headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'Mozilla/5.0 NexAI'},timeout:35000});
    const d=r.data||{};let videoUrl=d.url||null;
    if(!videoUrl&&d.status==='picker'&&Array.isArray(d.picker))videoUrl=(d.picker.find(x=>x.type==='video')||d.picker[0])?.url||null;
    return videoUrl?{videoUrl,audioUrl:null,coverUrl:null,meta:{author:'TikTok Creator',description:'TikTok media',source:domain(url)}}:null;
  }catch(_){return null;}
}

async function resolve(url){
  const tasks=await Promise.allSettled([tikwm(url),customApi(url)]);
  for(const x of tasks)if(x.status==='fulfilled'&&x.value?.videoUrl)return x.value;
  const c=await cobalt(url);if(c)return c;
  return null;
}

async function sendVideo(sock,jid,url,msg){
  try{
    const r=await axios.get(url,{responseType:'arraybuffer',timeout:120000,maxContentLength:100*1024*1024,headers:{'User-Agent':'Mozilla/5.0','Accept':'video/*,*/*','Referer':'https://www.tiktok.com/'}});
    const b=Buffer.from(r.data||[]);if(b.length<5000)throw new Error('media invalide');
    return sock.sendMessage(jid,{video:b,mimetype:'video/mp4',caption:'🎬 *NexAI TikTok • Video*'},jid.endsWith('@g.us')?{quoted:msg}:undefined);
  }catch(_){
    return sock.sendMessage(jid,{video:{url},mimetype:'video/mp4',caption:'🎬 *NexAI TikTok • Video*'},jid.endsWith('@g.us')?{quoted:msg}:undefined);
  }
}

async function sendAudio(sock,jid,url,msg){
  if(!url)throw new Error('Audio séparé indisponible pour ce média.');
  try{
    const r=await axios.get(url,{responseType:'arraybuffer',timeout:90000,maxContentLength:40*1024*1024,headers:{'User-Agent':'Mozilla/5.0','Referer':'https://www.tiktok.com/'}});
    const b=Buffer.from(r.data||[]);if(b.length<1000)throw new Error('audio invalide');
    return sock.sendMessage(jid,{audio:b,mimetype:String(r.headers?.['content-type']||'audio/mpeg'),ptt:false,fileName:'NexAI-TikTok-Audio.mp3'},jid.endsWith('@g.us')?{quoted:msg}:undefined);
  }catch(_){
    return sock.sendMessage(jid,{audio:{url},mimetype:'audio/mpeg',ptt:false,fileName:'NexAI-TikTok-Audio.mp3'},jid.endsWith('@g.us')?{quoted:msg}:undefined);
  }
}

async function carouselFallback(sock,msg,extra,url){
  const data=await ttdl(url);
  const items=data?.data||[];
  if(!items.length)throw new Error('Aucun média TikTok récupérable.');
  for(const m of items.slice(0,20)){
    const u=m?.url;if(!u)continue;
    const isVideo=m.type==='video'||/\.(mp4|webm|mov)(\?|$)/i.test(u);
    await sock.sendMessage(extra.from,isVideo?{video:{url:u},mimetype:'video/mp4',caption:'🎬 *NexAI TikTok*'}:{image:{url:u},caption:'🖼️ *NexAI TikTok carousel*'},extra.from.endsWith('@g.us')?{quoted:msg}:undefined);
  }
}

module.exports={
  name:'tiktok',
  aliases:['tt','ttdl','tiktokdl','tkhd','tiktokpremium'],
  category:'📥 Téléchargements',
  description:'Télécharge TikTok avec fiche riche NexAI, vidéo et audio.',
  usage:`${config.prefix||'.'}tiktok <lien>`,
  async execute(sock,msg,args,extra){
    prune();
    const messageKey=sessionContext.scopeKey(msg?.key?.id||crypto.randomBytes(4).toString('hex'));
    if(processed.has(messageKey))return;
    processed.add(messageKey);const timer=setTimeout(()=>processed.delete(messageKey),5*60*1000);timer.unref?.();

    const action=String(args?.[0]||'').toLowerCase();
    if(action==='action'){
      const kind=String(args?.[1]||'').toLowerCase(),token=String(args?.[2]||'');
      const item=CACHE.get(token);
      if(!item||Date.now()-item.createdAt>TTL)return extra.reply('⚠️ Cette fiche TikTok a expiré. Relance la commande avec le lien.');
      if(item.chat!==extra.from||item.sender!==sender(msg))return extra.reply('🔒 Cette action appartient à une autre session utilisateur.');
      try{
        if(kind==='video')await sendVideo(sock,extra.from,item.videoUrl,msg);
        else if(kind==='audio')await sendAudio(sock,extra.from,item.audioUrl,msg);
        else return extra.reply('⚠️ Action TikTok inconnue.');
        await sock.sendMessage(extra.from,{react:{text:'✅',key:msg.key}}).catch(()=>{});
      }catch(e){await extra.reply(`❌ ${e.message}`);}
      return;
    }

    const url=String(args?.join(' ')||'').match(/https?:\/\/\S+/)?.[0];
    if(!url||!/tiktok\.com\//i.test(url))return extra.reply(`🎬 *NexAI TikTok*\nEnvoie un lien valide.\nExemple : ${config.prefix||'.'}tiktok https://vt.tiktok.com/...`);
    await sock.sendMessage(extra.from,{react:{text:'⏳',key:msg.key}}).catch(()=>{});

    try{
      const result=await resolve(url);
      if(!result?.videoUrl){
        await carouselFallback(sock,msg,extra,url);
        await sock.sendMessage(extra.from,{react:{text:'✅',key:msg.key}}).catch(()=>{});
        return;
      }

      const token=crypto.randomBytes(9).toString('base64url');
      const coverBuffer=await fetchBuffer(result.coverUrl);
      const meta={...result.meta,coverBuffer,source:domain(url)};
      CACHE.set(token,{...result,meta,chat:extra.from,sender:sender(msg),createdAt:Date.now()});

      const image=await renderTikTokCard(meta);
      const buttons=[
        {text:'⬇ Download video',id:`nexui:tiktok:video:${token}`},
        ...(result.audioUrl?[{text:'♫ Download audio',id:`nexui:tiktok:audio:${token}`}]:[])
      ];
      await sendRichCard({
        sock,jid:extra.from,imageBuffer:image,
        caption:`🎬 *NexAI TikTok Download*\n${meta.author||'TikTok Creator'} • média prêt`,
        footer:'NEXAI • RICH MEDIA',
        quoted:extra.from.endsWith('@g.us')?msg:null,
        buttons,
        fallbackLines:[
          `${config.prefix||'.'}tiktok action video ${token}`,
          ...(result.audioUrl?[`${config.prefix||'.'}tiktok action audio ${token}`]:[])
        ]
      });
      await sock.sendMessage(extra.from,{react:{text:'✅',key:msg.key}}).catch(()=>{});
    }catch(e){
      console.error('[nexai:tiktok]',e.message);
      await sock.sendMessage(extra.from,{react:{text:'❌',key:msg.key}}).catch(()=>{});
      await extra.reply('❌ Impossible de préparer ce TikTok pour le moment.');
    }
  }
};
