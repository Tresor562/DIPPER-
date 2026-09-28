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

const MAX_VIDEO_BYTES = Number(process.env.TIKTOK_VIDEO_MAX_BYTES || 45 * 1024 * 1024);
const MAX_AUDIO_BYTES = Number(process.env.TIKTOK_AUDIO_MAX_BYTES || 35 * 1024 * 1024);
const RESOLVE_TIMEOUT_MS = Number(process.env.TIKTOK_RESOLVE_TIMEOUT_MS || 30000);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.TIKTOK_DOWNLOAD_TIMEOUT_MS || 90000);
const SEND_TIMEOUT_MS = Number(process.env.TIKTOK_SEND_TIMEOUT_MS || 60000);

const abs = u => !u ? null : String(u).startsWith('/') ? 'https://www.tikwm.com' + u : String(u);
const domain = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch (_) { return 'tiktok.com'; } };
const sender = msg => String(msg?.key?.participant || msg?.key?.remoteJid || '').split(':')[0];

function prune(){
  const now=Date.now();
  for(const [key,value] of CACHE) if(!value || now-value.createdAt>TTL) CACHE.delete(key);
}

function withTimeout(promise, ms, label){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(`${label} expiré après ${Math.ceil(ms/1000)} s`)),ms);
      timer.unref?.();
    })
  ]).finally(()=>clearTimeout(timer));
}

async function fetchMediaBuffer(url,{maxBytes,timeoutMs=DOWNLOAD_TIMEOUT_MS,referer='https://www.tiktok.com/'}={}){
  if(!url) throw new Error('URL média TikTok absente.');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  timer.unref?.();

  try{
    const r=await axios.get(url,{
      responseType:'stream',
      timeout:Math.min(timeoutMs,45000),
      signal:controller.signal,
      maxRedirects:6,
      maxContentLength:Infinity,
      maxBodyLength:Infinity,
      validateStatus:s=>s>=200&&s<400,
      headers:{
        'User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept':'video/*,audio/*,application/octet-stream;q=0.9,*/*;q=0.8',
        'Accept-Encoding':'identity',
        'Referer':referer
      }
    });

    const declared=Number(r.headers?.['content-length']||0);
    if(declared && maxBytes && declared>maxBytes){
      try{r.data.destroy?.();}catch(_){}
      throw new Error(`Média TikTok trop volumineux (${Math.ceil(declared/1024/1024)} Mo ; limite ${Math.ceil(maxBytes/1024/1024)} Mo)`);
    }

    const chunks=[];
    let bytes=0;
    for await (const chunk of r.data){
      const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
      bytes+=b.length;
      if(maxBytes && bytes>maxBytes){
        try{r.data.destroy?.();}catch(_){}
        throw new Error(`Média TikTok trop volumineux (limite ${Math.ceil(maxBytes/1024/1024)} Mo)`);
      }
      chunks.push(b);
    }
    if(bytes<512) throw new Error('Le serveur TikTok a renvoyé un média vide ou invalide.');

    return {
      buffer:Buffer.concat(chunks,bytes),
      contentType:String(r.headers?.['content-type']||'application/octet-stream').split(';')[0],
      bytes
    };
  }catch(e){
    if(controller.signal.aborted) throw new Error('Téléchargement TikTok expiré.');
    throw e;
  }finally{
    clearTimeout(timer);
  }
}

async function fetchBuffer(url,limit=8*1024*1024){
  if(!url)return null;
  try{
    const media=await fetchMediaBuffer(url,{maxBytes:limit,timeoutMs:12000,referer:'https://www.tiktok.com/'});
    return media.buffer.length>128?media.buffer:null;
  }catch(_){
    return null;
  }
}

async function tikwm(url){
  const r=await withTimeout(
    axios.post(
      'https://www.tikwm.com/api/',
      new URLSearchParams({url,hd:'1'}).toString(),
      {
        headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0'},
        timeout:RESOLVE_TIMEOUT_MS
      }
    ),
    RESOLVE_TIMEOUT_MS+2000,
    'TikWM'
  );
  const d=r.data?.data;
  if(!d)throw new Error('TikWM sans données');
  return {
    videoUrl:abs(d.hdplay||d.play),
    audioUrl:abs(d.music),
    coverUrl:abs(d.cover||d.origin_cover||d.ai_dynamic_cover),
    meta:{
      author:d.author?.nickname||d.author?.unique_id||'TikTok Creator',
      username:d.author?.unique_id||'',
      description:d.title||'',
      title:d.title||'',
      views:d.play_count||0,
      likes:d.digg_count||0,
      comments:d.comment_count||0,
      shares:d.share_count||0,
      saves:d.collect_count||0,
      duration:d.duration||0,
      music:d.music_info?.title||d.music_info?.author||'Original sound',
      source:'tiktok.com'
    }
  };
}

async function customApi(url){
  try{
    const r=await withTimeout(APIs.getTikTokDownload(url),RESOLVE_TIMEOUT_MS,'API TikTok secondaire');
    if(!r?.videoUrl)return null;
    return {
      videoUrl:r.videoUrl,
      audioUrl:r.audioUrl||null,
      coverUrl:r.cover||null,
      meta:{author:'TikTok Creator',description:r.title||'',title:r.title||'',source:domain(url)}
    };
  }catch(_){
    return null;
  }
}

async function cobalt(url){
  try{
    const r=await withTimeout(
      axios.post(
        'https://api.cobalt.tools/',
        {url,downloadMode:'auto',videoQuality:'max',tiktokH265:false},
        {
          headers:{'Content-Type':'application/json','Accept':'application/json','User-Agent':'Mozilla/5.0 NexAI'},
          timeout:RESOLVE_TIMEOUT_MS
        }
      ),
      RESOLVE_TIMEOUT_MS+2000,
      'Cobalt'
    );
    const d=r.data||{};
    let videoUrl=d.url||null;
    if(!videoUrl&&d.status==='picker'&&Array.isArray(d.picker)){
      videoUrl=(d.picker.find(x=>x.type==='video')||d.picker[0])?.url||null;
    }
    return videoUrl?{
      videoUrl,
      audioUrl:null,
      coverUrl:null,
      meta:{author:'TikTok Creator',description:'TikTok media',source:domain(url)}
    }:null;
  }catch(_){
    return null;
  }
}

async function resolve(url){
  const tasks=await Promise.allSettled([tikwm(url),customApi(url)]);
  for(const x of tasks){
    if(x.status==='fulfilled'&&x.value?.videoUrl)return x.value;
  }
  const c=await cobalt(url);
  if(c)return c;
  return null;
}

async function sendVideo(sock,jid,url,msg){
  const media=await fetchMediaBuffer(url,{maxBytes:MAX_VIDEO_BYTES});
  if(media.buffer.length<5000) throw new Error('Vidéo TikTok invalide.');

  return withTimeout(
    sock.sendMessage(
      jid,
      {
        video:media.buffer,
        mimetype:media.contentType.startsWith('video/')?media.contentType:'video/mp4',
        fileName:'NexAI-TikTok.mp4',
        caption:'🎬 *NexAI TikTok • Video*'
      },
      jid.endsWith('@g.us')?{quoted:msg}:undefined
    ),
    SEND_TIMEOUT_MS,
    'Envoi WhatsApp TikTok'
  );
}

async function sendAudio(sock,jid,url,msg){
  if(!url)throw new Error('Audio séparé indisponible pour ce média.');
  const media=await fetchMediaBuffer(url,{maxBytes:MAX_AUDIO_BYTES});
  if(media.buffer.length<1000)throw new Error('Audio TikTok invalide.');

  return withTimeout(
    sock.sendMessage(
      jid,
      {
        audio:media.buffer,
        mimetype:media.contentType.startsWith('audio/')?media.contentType:'audio/mpeg',
        ptt:false,
        fileName:'NexAI-TikTok-Audio.mp3'
      },
      jid.endsWith('@g.us')?{quoted:msg}:undefined
    ),
    SEND_TIMEOUT_MS,
    'Envoi audio WhatsApp TikTok'
  );
}

async function carouselFallback(sock,msg,extra,url){
  const data=await withTimeout(ttdl(url),RESOLVE_TIMEOUT_MS,'Fallback TikTok');
  const items=data?.data||[];
  if(!items.length)throw new Error('Aucun média TikTok récupérable.');

  let sent=0;
  for(const m of items.slice(0,10)){
    const u=m?.url;
    if(!u)continue;
    const isVideo=m.type==='video'||/\.(mp4|webm|mov)(\?|$)/i.test(u);
    try{
      if(isVideo){
        await sendVideo(sock,extra.from,u,msg);
      }else{
        const media=await fetchMediaBuffer(u,{maxBytes:15*1024*1024,timeoutMs:45000});
        await withTimeout(
          sock.sendMessage(
            extra.from,
            {image:media.buffer,caption:'🖼️ *NexAI TikTok carousel*'},
            extra.from.endsWith('@g.us')?{quoted:msg}:undefined
          ),
          SEND_TIMEOUT_MS,
          'Envoi image TikTok'
        );
      }
      sent++;
    }catch(e){
      console.warn('[nexai:tiktok] média fallback ignoré:',e?.message||e);
    }
  }
  if(!sent) throw new Error('Les médias TikTok trouvés sont inaccessibles ou expirés.');
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
    processed.add(messageKey);
    const timer=setTimeout(()=>processed.delete(messageKey),5*60*1000);
    timer.unref?.();

    const action=String(args?.[0]||'').toLowerCase();
    if(action==='action'){
      const kind=String(args?.[1]||'').toLowerCase();
      const token=String(args?.[2]||'');
      const item=CACHE.get(token);

      if(!item||Date.now()-item.createdAt>TTL){
        return extra.reply('⚠️ Cette fiche TikTok a expiré. Relance la commande avec le lien.');
      }
      if(item.chat!==extra.from||item.sender!==sender(msg)){
        return extra.reply('🔒 Cette action appartient à une autre session utilisateur.');
      }

      await sock.sendMessage(extra.from,{react:{text:'⏳',key:msg.key}}).catch(()=>{});
      try{
        if(kind==='video'){
          await sendVideo(sock,extra.from,item.videoUrl,msg);
        }else if(kind==='audio'){
          await sendAudio(sock,extra.from,item.audioUrl,msg);
        }else{
          return extra.reply('⚠️ Action TikTok inconnue.');
        }
        await sock.sendMessage(extra.from,{react:{text:'✅',key:msg.key}}).catch(()=>{});
      }catch(e){
        console.error('[nexai:tiktok action]',e?.stack||e?.message||e);
        await sock.sendMessage(extra.from,{react:{text:'❌',key:msg.key}}).catch(()=>{});
        await extra.reply(`❌ Téléchargement TikTok échoué : ${String(e?.message||e).slice(0,300)}`).catch(()=>{});
      }
      return;
    }

    const url=String(args?.join(' ')||'').match(/https?:\/\/\S+/)?.[0];
    if(!url||!/tiktok\.com\//i.test(url)){
      return extra.reply(`🎬 *NexAI TikTok*\nEnvoie un lien valide.\nExemple : ${config.prefix||'.'}tiktok https://vt.tiktok.com/...`);
    }

    await sock.sendMessage(extra.from,{react:{text:'⏳',key:msg.key}}).catch(()=>{});

    try{
      const result=await withTimeout(resolve(url),RESOLVE_TIMEOUT_MS*2+5000,'Résolution TikTok');
      if(!result?.videoUrl){
        await carouselFallback(sock,msg,extra,url);
        await sock.sendMessage(extra.from,{react:{text:'✅',key:msg.key}}).catch(()=>{});
        return;
      }

      const token=crypto.randomBytes(9).toString('base64url');
      const coverBuffer=await fetchBuffer(result.coverUrl);
      const meta={...result.meta,coverBuffer,source:domain(url)};
      CACHE.set(token,{...result,meta,chat:extra.from,sender:sender(msg),createdAt:Date.now()});

      try{
        const image=await withTimeout(renderTikTokCard(meta),15000,'Carte TikTok');
        const buttons=[
          {text:'⬇ Download video',id:`nexui:tiktok:video:${token}`},
          ...(result.audioUrl?[{text:'♫ Download audio',id:`nexui:tiktok:audio:${token}`}]:[])
        ];

        await withTimeout(sendRichCard({
          sock,
          jid:extra.from,
          imageBuffer:image,
          caption:`🎬 *NexAI TikTok Download*\n${meta.author||'TikTok Creator'} • média prêt`,
          footer:'NEXAI • RICH MEDIA',
          quoted:extra.from.endsWith('@g.us')?msg:null,
          buttons,
          fallbackLines:[
            `${config.prefix||'.'}tiktok action video ${token}`,
            ...(result.audioUrl?[`${config.prefix||'.'}tiktok action audio ${token}`]:[])
          ]
        }),30000,'Envoi de la fiche TikTok');
      }catch(cardErr){
        console.warn('[nexai:tiktok] carte riche indisponible, envoi vidéo direct:',cardErr?.message||cardErr);
        await sendVideo(sock,extra.from,result.videoUrl,msg);
      }

      await sock.sendMessage(extra.from,{react:{text:'✅',key:msg.key}}).catch(()=>{});
    }catch(e){
      console.error('[nexai:tiktok]',e?.stack||e?.message||e);
      await sock.sendMessage(extra.from,{react:{text:'❌',key:msg.key}}).catch(()=>{});
      await extra.reply(`❌ Téléchargement TikTok échoué : ${String(e?.message||e).slice(0,300)}`).catch(()=>{});
    }
  }
};
