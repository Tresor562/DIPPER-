'use strict';
const axios=require('axios');
const UA='Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
async function download(url){const r=await axios.get(url,{responseType:'arraybuffer',timeout:15000,maxContentLength:15*1024*1024,headers:{'User-Agent':UA,Accept:'image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8'}});const b=Buffer.from(r.data||[]);const type=String(r.headers?.['content-type']||'').toLowerCase();if(!b.length||(!type.startsWith('image/')&&b.length<1500))throw new Error('réponse image invalide');return{buffer:b,url,contentType:type}}
async function candidates(type){const list=[];if(type==='neko'){
  try{const r=await axios.get('https://nekos.best/api/v2/neko',{timeout:8000,headers:{'User-Agent':UA}});const u=r.data?.results?.[0]?.url;if(u)list.push(u)}catch(_){}
  try{const r=await axios.get('https://api.waifu.pics/sfw/neko',{timeout:8000,headers:{'User-Agent':UA}});if(r.data?.url)list.push(r.data.url)}catch(_){}
  try{const r=await axios.get('https://nekos.moe/api/v1/random/image?nsfw=false',{timeout:8000,headers:{'User-Agent':UA}});const id=r.data?.images?.[0]?.id;if(id)list.push(`https://nekos.moe/image/${id}`)}catch(_){}
}else{
  try{const r=await axios.get(`https://api.waifu.pics/sfw/${encodeURIComponent(type||'waifu')}`,{timeout:8000,headers:{'User-Agent':UA}});if(r.data?.url)list.push(r.data.url)}catch(_){}
  try{const r=await axios.get(`https://nekos.best/api/v2/${type==='cosplay'?'kitsune':(type||'waifu')}`,{timeout:8000,headers:{'User-Agent':UA}});const u=r.data?.results?.[0]?.url;if(u)list.push(u)}catch(_){}
}
return [...new Set(list)]}
module.exports=async function resolveAnimeImage(type='neko'){const urls=await candidates(type);const errors=[];for(const url of urls){try{return await download(url)}catch(e){errors.push(e.message)}}throw new Error(`Aucune image ${type} disponible${errors.length?` (${errors.slice(-2).join(' | ')})`:''}`)};
