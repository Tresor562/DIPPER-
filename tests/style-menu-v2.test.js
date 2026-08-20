'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const catalog=require('../utils/styleCatalog');const manager=require('../utils/styleManager');const response=require('../utils/responseStyle');const {sendCarousel,newsletterContext}=require('../utils/whatsappCarousel');

test('catalog exposes exactly 32 valid styles and no Levi theme',()=>{assert.equal(catalog.MAX_STYLE,31);assert.equal(Object.keys(catalog.THEMES).length,32);for(let i=0;i<=31;i++){const t=catalog.getTheme(i);assert.ok(t.name);assert.ok(t.botName);assert.ok(t.separator);assert.ok(t.signature);}assert.equal(Object.values(catalog.THEMES).some(t=>/levi/i.test(t.name)),false);assert.equal(catalog.getTheme(15).name,'Eren Yeager');});

test('style manager accepts 0..31 and rejects out of range',()=>{for(let i=0;i<=31;i++){manager.setStyle(i);assert.equal(manager.getStyle(),i);assert.equal(manager.getStyleName(i),catalog.getTheme(i).name);}manager.setStyle(999);assert.equal(manager.getStyle(),31);manager.setStyle(-1);assert.equal(manager.getStyle(),31);manager.setStyle(0);});

test('100000 deterministic style-response invariants',()=>{for(let i=0;i<100000;i++){const s=i%32;manager.setStyle(s);const t=catalog.getTheme(s);const p=manager.getPhrases();assert.equal(typeof p.wait(),'string');assert.ok(p.footer().includes(t.signature));const rendered=response.renderResponse({type:i%3===0?'success':i%3===1?'error':'wait',title:'SIM',body:`run-${i}`,style:s});assert.ok(rendered.includes(`run-${i}`));assert.ok(rendered.length<2000);assert.equal(catalog.normalizeStyle(s),s);}manager.setStyle(0);});

test('carousel relay failure falls back to sendMessage and keeps newsletter context',async()=>{const sent=[];const sock={user:{id:'229000000000@s.whatsapp.net'},relayMessage:async()=>{throw new Error('relay down');},sendMessage:async(jid,payload)=>{sent.push({jid,payload});return{key:{id:'fallback-1'}};}};const ctx=newsletterContext({newsletterJid:'123@newsletter'},'TEST');const result=await sendCarousel({sock,jid:'229000000001@s.whatsapp.net',quoted:{key:{id:'q'}},cards:[{title:'A',body:'B',buttons:[]}],contextInfo:ctx,fallbackText:'SAFE FALLBACK'});assert.ok(['text','plain'].includes(result.mode));assert.equal(sent.length,1);assert.equal(sent[0].payload.text,'SAFE FALLBACK');});

test('new character media pools currently registered without invalid values',()=>{for(let i=21;i<=31;i++){for(const u of catalog.getImages(i))assert.match(u,/^https:\/\/ibb\.co\//);}});
