'use strict';

const {downloadContentFromMessage}=require('@whiskeysockets/baileys');

const MAX_SOURCE_BYTES=8*1024*1024;

function imageMessageFrom(msg){
  const direct=msg?.message?.imageMessage;
  if(direct)return direct;
  const quoted=msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
  return quoted||null;
}

async function downloadImageBuffer(imageMsg,{downloader=downloadContentFromMessage,maxBytes=MAX_SOURCE_BYTES}={}){
  if(!imageMsg)throw new Error('OBJECT_ZOOM_IMAGE_REQUIRED');
  const declared=Number(imageMsg.fileLength||0);
  if(declared&&declared>maxBytes)throw new Error('OBJECT_ZOOM_IMAGE_TOO_LARGE');
  const stream=await downloader(imageMsg,'image');
  const chunks=[];let total=0;
  for await(const chunk of stream){
    const buf=Buffer.from(chunk);total+=buf.length;
    if(total>maxBytes)throw new Error('OBJECT_ZOOM_IMAGE_TOO_LARGE');
    chunks.push(buf);
  }
  if(!total)throw new Error('OBJECT_ZOOM_EMPTY_IMAGE');
  return Buffer.concat(chunks,total);
}

module.exports={MAX_SOURCE_BYTES,imageMessageFrom,downloadImageBuffer};
