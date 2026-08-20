'use strict';

const MAX_STYLE = 31;

const THEMES = {
  0:{name:'DIPPER',botName:'⭐ THE BIG DIPPER',mark:'✦',accent:'⭐',separator:'✦ ─────── ✦',signature:'✦ DIPPER',tagline:'sept étoiles, une seule direction',wait:'Traitement en cours...',success:'Opération réussie.',error:'Vérifie ta demande.',denied:'Accès réservé.'},
  1:{name:'Dark',botName:'♰ DARK DIPPER',mark:'♰',accent:'🌑',separator:'♰ ─────── ♰',signature:'♰ DIPPER',tagline:"l'ombre incarnée",wait:"L'ombre agit...",success:"L'ombre a agi.",error:'Demande incomplète.',denied:'Accès réservé.'},
  2:{name:'Naruto',botName:'🍃 DIPPER × NARUTO',mark:'🍃',accent:'🌀',separator:'🍃 ───── 🌀',signature:'🍃 Dattebayo',tagline:'la volonté du feu',wait:'Jutsu en cours...',success:'Mission accomplie !',error:'Argument manquant, dattebayo !',denied:'Jutsu réservé.'},
  3:{name:'Cid Kagenou / Shadow',botName:'◈ DIPPER // SHADOW',mark:'◈',accent:'🕶️',separator:'◈ ─────── ◈',signature:'◈ The Shadow',tagline:'I am atomic',wait:"L'ombre agit...",success:'Mission exécutée.',error:'Demande incomplète.',denied:'Accès réservé.'},
  4:{name:'Hacker',botName:'[ DIPPER://ROOT ]',mark:'>',accent:'💻',separator:'[========]',signature:'[ DIPPER ]',tagline:'access granted',wait:'[ PROCESSING ]',success:'[ OK ]',error:'[ ERROR ]',denied:'[ DENIED ]'},
  5:{name:'Manhwa',botName:'⚔️ DIPPER // LEVEL UP',mark:'⚔️',accent:'⬆️',separator:'⚔️ ───── ⬆️',signature:'⚔️ LEVEL UP',tagline:'rise through every level',wait:'Activation du skill...',success:'Skill terminé.',error:'Paramètre requis.',denied:'Rang insuffisante.'},
  6:{name:'Ai Oshino',botName:'⭐ DIPPER × AI',mark:'⭐',accent:'✨',separator:'⭐ ───── ✨',signature:'⭐ DIPPER × Ai',tagline:'true idol',wait:'Préparation en cours...',success:"C'est prêt !",error:'Information manquante.',denied:'Accès réservé.'},
  7:{name:'Ruby Oshino',botName:'🌸 DIPPER × RUBY',mark:'🌸',accent:'💗',separator:'🌸 ───── 💗',signature:'🌸 DIPPER × Ruby',tagline:'shine brighter',wait:'Un instant...',success:"C'est terminé !",error:'Il manque une information.',denied:'Accès réservé.'},
  8:{name:'Satoru Gojo',botName:'♾️ DIPPER × GOJO',mark:'♾️',accent:'👁️',separator:'♾️ ───── 👁️',signature:'♾️ Infinity',tagline:'limitless interface',wait:'Infinity activé...',success:'Terminé. Trop facile.',error:'Argument manquant.',denied:'Accès réservé.'},
  9:{name:'Oreki Houtarou',botName:'🌿 DIPPER // OREKI',mark:'·',accent:'🌿',separator:'· ─────── ·',signature:'· DIPPER',tagline:'energy saving mode',wait:'Traitement...',success:"Fait. C'est tout.",error:'Argument manquant.',denied:'Pas autorisé.'},
  10:{name:'Marin Kitagawa',botName:'🎀 DIPPER × MARIN',mark:'🎀',accent:'🌸',separator:'🎀 ───── 🌸',signature:'🎀 DIPPER × Marin',tagline:'cosplay mode',wait:'Préparation...',success:"Parfait, c'est prêt !",error:'Il manque quelque chose.',denied:'Accès réservé.'},
  11:{name:'Sung Jin-Woo',botName:'🩸 SYSTEM // DIPPER',mark:'🩸',accent:'🗡️',separator:'🩸 ───── 🗡️',signature:'🩸 ARISE',tagline:'shadow monarch system',wait:'Les ombres travaillent...',success:'Ordre exécuté.',error:'Argument manquant.',denied:'Accès réservé.'},
  12:{name:'Madara Uchiha',botName:'🌑 DIPPER × MADARA',mark:'🌑',accent:'♟️',separator:'🌑 ───── ♟️',signature:'🌑 Uchiha',tagline:'wake from illusion',wait:'Exécution en cours...',success:'Exécution accomplie.',error:'Demande incomplète.',denied:'Accès refusé.'},
  13:{name:'Aizen Sosuke',botName:'🪷 DIPPER × AIZEN',mark:'🪷',accent:'🕶️',separator:'🪷 ───── ·',signature:'🪷 Aizen',tagline:'all according to plan',wait:'Exécution en cours...',success:"Tout s'est déroulé comme prévu.",error:'Argument manquant.',denied:'Accès insuffisant.'},
  14:{name:'Lelouch Lamperouge',botName:'♔ DIPPER // ZERO',mark:'♔',accent:'👁️',separator:'♔ ───── 👁️',signature:'♔ ZERO',tagline:'the command is absolute',wait:"Exécution de l'ordre...",success:'Ordre exécuté.',error:'Précision requise.',denied:'Autorité insuffisante.'},
  15:{name:'Eren Yeager',botName:'⚡ DIPPER × EREN',mark:'⚡',accent:'⛓️',separator:'⚡ ───── ⛓️',signature:"⚡ Continue d'avancer",tagline:'keep moving forward',wait:'Avance en cours...',success:'Terminé.',error:'Demande incomplète.',denied:'Accès refusé.'},
  16:{name:'Itachi Uchiha',botName:'☾ DIPPER × ITACHI',mark:'☾',accent:'👁️',separator:'☾ ───── 👁️',signature:'☾ Itachi',tagline:'silent mission',wait:'Mission en cours...',success:'Mission accomplie.',error:'Paramètre manquant.',denied:'Accès refusé.'},
  17:{name:'Yhwach',botName:'☩ DIPPER // ALMIGHTY',mark:'☩',accent:'👑',separator:'☩ ───── 👑',signature:'☩ Almighty',tagline:'the future is visible',wait:'Exécution en cours...',success:'Décision exécutée.',error:'Argument manquant.',denied:'Accès refusé.'},
  18:{name:'Business Pro',botName:'DIPPER • BUSINESS',mark:'•',accent:'📊',separator:'• ─────── •',signature:'DIPPER • Business',tagline:'efficacité sans compromis',wait:'Traitement en cours...',success:'Opération réussie.',error:'Paramètre requis.',denied:'Accès non autorisé.'},
  19:{name:'Shadow Merchant',botName:'🌒 DIPPER // MERCHANT',mark:'🌒',accent:'🕯️',separator:'🌒 ───── 🕯️',signature:'🌒 Marché nocturne',tagline:'tout se négocie dans l’ombre',wait:'Transaction en cours...',success:'Transaction terminée.',error:'Livraison incomplète.',denied:'Accès refusé.'},
  20:{name:'Purgeur Suprême',botName:'🔥 DIPPER // PURGE',mark:'🔥',accent:'☄️',separator:'🔥 ───── ☄️',signature:'🔥 PURGE COMPLETE',tagline:'purification protocol',wait:'Purification en cours...',success:'Opération accomplie.',error:'Demande incomplète.',denied:'Accès refusé.'},
  21:{name:'Mio Haimiya',botName:'🖤 DIPPER × MIO',mark:'🖤',accent:'🌙',separator:'🖤 ───── 🌙',signature:'🖤 MIO // DIPPER',tagline:'quiet midnight',wait:'Mio prépare tout...',success:'C’est prêt.',error:'Il manque une information.',denied:'Accès réservé.'},
  22:{name:'Nazuna Nanakusa',botName:'🌙 NAZUNA DIPPER',mark:'☾',accent:'🦇',separator:'☾ ───── 🦇',signature:'☾ NAZUNA NIGHT',tagline:'night vampire • neon • tokyo',wait:'La nuit se met en place...',success:'La nuit est prête.',error:'Il manque quelque chose.',denied:'Accès nocturne réservé.'},
  23:{name:'Kaoruko Waguri',botName:'୨ৎ WAGURI × DIPPER',mark:'୨ৎ',accent:'🌸',separator:'୨ৎ ───── 🌸',signature:'୨ৎ WAGURI',tagline:'fragrant flower',wait:'Un instant...',success:'Tout est prêt 🌷',error:'Une précision manque.',denied:'Accès réservé.'},
  24:{name:'Alya',botName:'❄️ ALYA × DIPPER',mark:'❄️',accent:'🩵',separator:'❄️ ───── 🩵',signature:'❄️ ALYA',tagline:'ice • elegance • secret words',wait:'Подожди... préparation en cours.',success:'Готово. C’est prêt.',error:'Il manque une précision.',denied:'Accès réservé.'},
  25:{name:'Anna Yamada',botName:'🍫 DIPPER × ANNA',mark:'🍫',accent:'🖤',separator:'🍫 ───── 🖤',signature:'🍫 ANNA',tagline:'sweet • quiet • cinema',wait:'Anna prépare ça...',success:'Voilà, c’est prêt.',error:'Il manque quelque chose.',denied:'Accès réservé.'},
  26:{name:'Subaru Hoshina',botName:'⚔️ DIPPER × HOSHINA',mark:'⚔️',accent:'🟣',separator:'⚔️ ───── 🟣',signature:'⚔️ HOSHINA',tagline:'vice-captain combat mode',wait:'Lame en préparation...',success:'Cible traitée.',error:'Instruction incomplète.',denied:'Autorisation insuffisante.'},
  27:{name:'Meguru Bachira',botName:'⚽ DIPPER // MONSTER',mark:'⚽',accent:'⚡',separator:'⚽ ───── ⚡',signature:'⚽ BACHIRA // EGO',tagline:'monster • ego • football',wait:'Le monstre s’éveille...',success:'Dribble terminé.',error:'Passe incomplète.',denied:'Terrain réservé.'},
  28:{name:'Rin Itoshi',botName:'🎯 DIPPER × RIN',mark:'🎯',accent:'💚',separator:'🎯 ───── 💚',signature:'🎯 RIN // EGO',tagline:'precision • cold ego',wait:'Calcul de la trajectoire...',success:'Cible atteinte.',error:'Donnée incomplète.',denied:'Accès refusé.'},
  29:{name:'Power',botName:'🩸 DIPPER × POWER',mark:'🩸',accent:'😈',separator:'🩸 ───── 😈',signature:'🩸 POWER!',tagline:'blood fiend chaos',wait:'POWER prépare le chaos...',success:'Évidemment que ça marche !',error:'Donne-moi tout correctement !',denied:'Humain indigne.'},
  30:{name:'Shinobu Kocho',botName:'🦋 DIPPER × SHINOBU',mark:'🦋',accent:'💜',separator:'🦋 ───── 💜',signature:'🦋 SHINOBU',tagline:'wisteria • poison • elegance',wait:'Le poison se prépare...',success:'C’est terminé, doucement.',error:'Il manque une information.',denied:'Accès réservé.'},
  31:{name:'Benimaru Shinmon',botName:'🔥 DIPPER × BENIMARU',mark:'🔥',accent:'⛩️',separator:'🔥 ───── ⛩️',signature:'🔥 BENIMARU',tagline:'asakusa • fire force',wait:'Les flammes montent...',success:'Incendie maîtrisé.',error:'Ordre incomplet.',denied:'Accès refusé.'},
};

const IMAGE_PAGES = {
  21:['https://ibb.co/2YNc3Yry','https://ibb.co/Jwn3nnZR','https://ibb.co/fwwTZBj','https://ibb.co/Fb5SbwcB','https://ibb.co/Q3mFcV7z'],
  22:['https://ibb.co/fd5DPdvH','https://ibb.co/11NHy34','https://ibb.co/LzqL5Nys','https://ibb.co/7xs4qhXd','https://ibb.co/YTJYhGM0','https://ibb.co/FkWMDVJv'],
  23:['https://ibb.co/V0WNDzCg','https://ibb.co/hxWkf2fx','https://ibb.co/hJLFNv6n','https://ibb.co/9HF5z9wX','https://ibb.co/Vc53DCy1','https://ibb.co/JDrYXH5'],
  24:['https://ibb.co/f7tSjD5','https://ibb.co/LWgcwkn','https://ibb.co/CR3qBbS','https://ibb.co/9LDSKFJ','https://ibb.co/xtjTYzRn','https://ibb.co/M5kTP29p'],
  25:['https://ibb.co/qGHDyT7','https://ibb.co/5XDCzj48','https://ibb.co/wFXBXRTB','https://ibb.co/gFJZBnLH','https://ibb.co/v64Twhkf','https://ibb.co/SwwjbJjY'],
  26:['https://ibb.co/BH4JJ2Bq','https://ibb.co/Rk4LBTVH','https://ibb.co/1Y2wjdb7','https://ibb.co/ccGNftBx','https://ibb.co/DHTRhTpB','https://ibb.co/V0xpt9PP'],
  27:['https://ibb.co/FqhvgPTY','https://ibb.co/9H1rTg3Z','https://ibb.co/xqBcmgVL','https://ibb.co/5Qx2TYx','https://ibb.co/qYMvzZF6','https://ibb.co/vCKYR8SP'],
  28:['https://ibb.co/mCxNxnX4','https://ibb.co/Wvm36zRT','https://ibb.co/9kVJ4Nd5','https://ibb.co/9HJJqdLX','https://ibb.co/60mrZ5Wy','https://ibb.co/8gRxHJgZ'],
  29:['https://ibb.co/9f1Nnhn','https://ibb.co/C5zR5S7B','https://ibb.co/wFyh5zXQ','https://ibb.co/mrcDL4Bt','https://ibb.co/LD51ngvn','https://ibb.co/nMTRtMRT'],
  30:['https://ibb.co/Zz6p3JWN','https://ibb.co/4gPg2SGc','https://ibb.co/gbPd8DL3','https://ibb.co/fVc9jT54','https://ibb.co/V0LdW28B','https://ibb.co/1GQQfHVj'],
  31:['https://ibb.co/99n53Jz1','https://ibb.co/QGrRY9b','https://ibb.co/9jtzrL2','https://ibb.co/whS0L2yk','https://ibb.co/sdkBxMvr','https://ibb.co/7dwZSdKk','https://ibb.co/8D8VB8WS','https://ibb.co/Xk3sjGNX'],
};

function normalizeStyle(value){const n=Number(value);return Number.isInteger(n)&&n>=0&&n<=MAX_STYLE?n:0;}
function getTheme(value){return THEMES[normalizeStyle(value)]||THEMES[0];}
function getStyleName(value){return getTheme(value).name;}
function getBotName(value){return getTheme(value).botName;}
function getImages(value){return IMAGE_PAGES[normalizeStyle(value)]||[];}
function buildMenuHeader(style,{user='Utilisateur',rank='Utilisateur',prefix='.',count=0}={}){
  const t=getTheme(style);
  return `${t.separator}\n   ${t.botName}\n${t.separator}\n┃ 👤 Utilisateur : ${user}\n┃ 🎖️ Rang : ${rank}\n┃ ⌁ Préfixe : [ ${prefix} ]\n┃ 📜 Commandes : ${count}\n${t.separator}\n\n_${t.tagline}_ ${t.accent}\n`;
}

module.exports={MAX_STYLE,THEMES,IMAGE_PAGES,normalizeStyle,getTheme,getStyleName,getBotName,getImages,buildMenuHeader};
