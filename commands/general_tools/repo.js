'use strict';
const config=require('../../config');
const {sendCtaMessage}=require('../../utils/connectionPresentation');
const WEB='https://the-big-dipper.onrender.com';
const TELEGRAM='https://t.me/the_big_dipper_bot';
module.exports={name:'repo',aliases:['forge','connexionbot','connectbot','source'],category:'🛠️ Outils généraux',description:'Affiche les moyens officiels de connecter THE BIG DIPPER.',usage:`${config.prefix||'.'}repo`,async execute(sock,msg,args,extra){const text=['🤖 *THE BIG DIPPER*','','Connecte ton propre bot WhatsApp depuis le Web ou Telegram.',`Tu peux aussi utiliser directement *${config.prefix||'.'}pair +numéro* depuis le bot.`,'','Aucun lien GitHub public n’est nécessaire pour la connexion.'].join('\n');return sendCtaMessage(sock,extra.from,{text,title:'THE BIG DIPPER',body:'Connexion officielle du bot',sourceUrl:WEB,quoted:extra.from?.endsWith('@g.us')?msg:null,buttons:[{label:'🌐 Connecter sur le Web',url:WEB},{label:'🤖 Connecter via Telegram',url:TELEGRAM}]});}};
