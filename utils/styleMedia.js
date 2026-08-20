'use strict';

const axios=require('axios');
const {getImages}=require('./styleCatalog');

const CACHE=new Map();
const TTL=6*60*60*1000;

async function resolveImageUrl(url){
  if(!url||!/^https?:\/\//i.test(url))return null;
  const cached=CACHE.get(url); if(cached&&Date.now()-cached.at<TTL)return cached.value;
  let value=url;
  try{
    if(/https?:\/\/(?:www\.)?ibb\.co\//i.test(url)){
      const page=await axios.get(url,{timeout:6000,headers:{'User-Agent':'Mozilla/5.0'},maxRedirects:4});
      const html=String(page.data||'');
      const m=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      value=m?m[1].replace(/&amp;/g,'&'):null;
    }
  }catch(_){value=null;}
  CACHE.set(url,{value,at:Date.now()}); return value;
}

async function fetchBuffer(url,{timeout=8000}={}){
  const direct=await resolveImageUrl(url); if(!direct)return null;
  try{
    const res=await axios.get(direct,{responseType:'arraybuffer',timeout,maxContentLength:8*1024*1024,headers:{'User-Agent':'Mozilla/5.0'},maxRedirects:4});
    const type=String(res.headers?.['content-type']||'');
    if(!/^image\//i.test(type)&&Buffer.byteLength(res.data||[])<1000)return null;
    const b=Buffer.from(res.data||[]); return b.length>1000?b:null;
  }catch(_){return null;}
}

async function getStyleImageBuffer(style){
  const urls=[...getImages(style)].sort(()=>Math.random()-.5);
  for(const url of urls){const b=await fetchBuffer(url);if(b)return b;}
  return null;
}

module.exports={resolveImageUrl,fetchBuffer,getStyleImageBuffer};
