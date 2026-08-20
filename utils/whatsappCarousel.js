'use strict';

const {generateWAMessageFromContent,prepareWAMessageMedia,proto}=require('@whiskeysockets/baileys');

function newsletterContext(config={},themeName='THE BIG DIPPER'){
  return {forwardingScore:1,isForwarded:true,forwardedNewsletterMessageInfo:{newsletterJid:config.newsletterJid||'120363411005383995@newsletter',newsletterName:themeName,serverMessageId:-1}};
}
function urlButton(text,url){return {name:'cta_url',buttonParamsJson:JSON.stringify({display_text:text,url,merchant_url:url})};}
function quickButton(text,id){return {name:'quick_reply',buttonParamsJson:JSON.stringify({display_text:text,id})};}

async function makeCard(sock,card){
  let imageMessage;
  if(card.imageBuffer){try{const media=await prepareWAMessageMedia({image:card.imageBuffer},{upload:sock.waUploadToServer});imageMessage=media.imageMessage;}catch(_){}}
  return proto.Message.InteractiveMessage.CarouselMessage.Card.fromObject({
    header:proto.Message.InteractiveMessage.Header.fromObject({title:card.title||'',hasMediaAttachment:!!imageMessage,imageMessage}),
    body:proto.Message.InteractiveMessage.Body.fromObject({text:card.body||''}),
    footer:proto.Message.InteractiveMessage.Footer.fromObject({text:card.footer||''}),
    nativeFlowMessage:proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({buttons:card.buttons||[]}),
  });
}

async function sendCarousel({sock,jid,quoted,cards,body='Glisse vers la gauche pour explorer.',footer='THE BIG DIPPER',contextInfo={},fallbackText=''}){
  try{
    const built=[];for(const card of cards)built.push(await makeCard(sock,card));
    const content=proto.Message.InteractiveMessage.fromObject({body:{text:body},footer:{text:footer},carouselMessage:{cards:built,messageVersion:1}});
    const msg=generateWAMessageFromContent(jid,{viewOnceMessage:{message:{messageContextInfo:{deviceListMetadata:{},deviceListMetadataVersion:2},interactiveMessage:content}}},{userJid:sock.user?.id,quoted});
    msg.message.viewOnceMessage.message.interactiveMessage.contextInfo=contextInfo;
    await sock.relayMessage(jid,msg.message,{messageId:msg.key.id});
    return {mode:'carousel',messageId:msg.key.id};
  }catch(error){
    const text=fallbackText||cards.map((c,i)=>`${i+1}. *${c.title}*\n${c.body}`).join('\n\n');
    try{const sent=await sock.sendMessage(jid,{text,contextInfo},{quoted});return {mode:'text',messageId:sent?.key?.id,error};}
    catch(second){try{const sent=await sock.sendMessage(jid,{text},{quoted});return {mode:'plain',messageId:sent?.key?.id,error:second};}catch(finalError){throw finalError;}}
  }
}

module.exports={newsletterContext,urlButton,quickButton,sendCarousel};
