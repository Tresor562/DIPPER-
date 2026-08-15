'use strict';
const config=require('../../config');
const {sendCtaMessage}=require('../../utils/connectionPresentation');
const PROJECTS=[{label:'👥 KnowMe Friends',url:'https://knowme-friends.vercel.app'},{label:'🛍️ Nexus Store',url:'https://nexus-store-one-lake.vercel.app'},{label:'🎮 Nexus Games',url:'https://nexus-games-psi.vercel.app'},{label:'💼 Portfolio',url:'https://tresor-hontonnou.zone.id'}];
module.exports={name:'boutique',aliases:['shop','store','projets','projects'],category:'🛠️ Outils généraux',description:'Découvre les principaux projets Nexus et KnowMe.',usage:`${config.prefix||'.'}boutique`,async execute(sock,msg,args,extra){return sendCtaMessage(sock,extra.from,{text:'🛍️ *NEXUS — BOUTIQUE & PROJETS*\n\nUne sélection rapide de mes plateformes et projets. Choisis simplement celui que tu veux découvrir 👇',title:'Nexus Projects',body:'Créé par Trésor',sourceUrl:PROJECTS[0].url,quoted:extra.from?.endsWith('@g.us')?msg:null,buttons:PROJECTS});}};
