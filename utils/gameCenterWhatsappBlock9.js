'use strict';

const styleManager=require('./styleManager');
const {THEMES}=require('./styleCatalog');
const {rpg,CLASSES,EXPLORE_COOLDOWN_MS,REST_COOLDOWN_MS}=require('./gameCenterRpg');

const SUPPORTED=new Set(['rpg','adventure','aventure']);
function theme(){return THEMES[styleManager.getStyle()]||THEMES[0];}
function banner(label,emoji='🗺️'){return `${emoji} *${theme().botName} — ${label}*`;}
function fmt(n){return Number(n||0).toLocaleString('fr-FR');}
function bar(value,max,size=12){const ratio=max?Math.max(0,Math.min(1,value/max)):0,fill=Math.round(ratio*size);return `${'█'.repeat(fill)}${'░'.repeat(size-fill)}`;}
function menu(prefix){return [banner('RPG — TERRES DU DIPPER','🗺️'),'','Créer ton héros :',`⚔️ *${prefix}rpg start warrior*`,`🪄 *${prefix}rpg start mage*`,`🗡️ *${prefix}rpg start rogue*`,'',`🧭 ${prefix}rpg explore`,`⚔️ ${prefix}rpg attack`,`🧪 ${prefix}rpg potion`,`🏕️ ${prefix}rpg rest`,`🏃 ${prefix}rpg flee`,`👤 ${prefix}rpg profile`].join('\n');}
function profileText(c){if(!c)return null;const klass=CLASSES[c.classId]||CLASSES.warrior;return [banner('HÉROS RPG',klass.emoji),'',`${klass.emoji} Classe : *${klass.name}*`,`⭐ Niveau : *${c.level}*  •  XP RPG : *${fmt(c.xp)}*`,`❤️ HP : *${c.hp}/${c.maxHp}*  ${bar(c.hp,c.maxHp)}`,`⚔️ Attaque : *${c.attack}*  •  🛡️ Défense : *${c.defense}*`,`🧪 Potions : *${c.potions}*`,`🏆 Victoires : *${c.victories}*  •  💀 Défaites : *${c.defeats}*`,`🧭 Explorations : *${c.explorations}*`,c.encounter?`\n⚠️ Combat actif : ${c.encounter.emoji} *${c.encounter.name}* ${c.encounter.hp}/${c.encounter.maxHp} HP`:null].filter(Boolean).join('\n');}
function monsterText(m){return `${m.emoji} *${m.name}* — ❤️ ${m.hp}/${m.maxHp}  ⚔️ ${m.attack}  🛡️ ${m.defense}`;}
async function executeRpg(sock,msg,args,extra,{prefix,sep}){
  const sub=String(args[0]||'').toLowerCase();
  if(!sub||sub==='menu')return extra.reply(menu(prefix)+sep());
  if(sub==='start'){
    const result=rpg.start(extra.sender,String(args[1]||'').toLowerCase());
    if(result.error==='class')return extra.reply(`❌ Classe : *warrior*, *mage* ou *rogue*.${sep()}`);
    if(result.error==='exists')return extra.reply(`⚠️ Ton héros existe déjà. Utilise *${prefix}rpg profile*.${sep()}`);
    return extra.reply(`${banner('NOUVEAU HÉROS','✨')}\n\n${profileText(result.character)}\n\n➡️ Commence avec *${prefix}rpg explore*.${sep()}`);
  }
  const c=rpg.get(extra.sender);
  if(!c)return extra.reply(`❌ Tu n’as pas encore de héros. Utilise *${prefix}rpg start warrior|mage|rogue*.${sep()}`);
  if(['profile','profil','stats'].includes(sub))return extra.reply(profileText(c)+sep());
  if(['explore','explorer'].includes(sub)){
    const r=rpg.explore(extra.sender);
    if(r.error==='cooldown')return extra.reply(`⏳ Exploration disponible dans *${Math.ceil(r.remainingMs/1000)} s*.${sep()}`);
    if(r.error==='encounter')return extra.reply(`⚔️ Un combat est déjà actif. Utilise *${prefix}rpg attack*, *potion* ou *flee*.${sep()}`);
    if(r.type==='monster')return extra.reply(`${banner('RENCONTRE','⚔️')}\n\n${monsterText(r.monster)}\n\nTon HP : *${r.character.hp}/${r.character.maxHp}*\n➡️ *${prefix}rpg attack*${sep()}`);
    if(r.type==='treasure')return extra.reply(`${banner('TRÉSOR','🎁')}\n\n🪙 +*${fmt(r.coins)} DC*\n⭐ +*${fmt(r.xp)} XP*${r.levelUp?'\n🌟 *NIVEAU RPG SUPÉRIEUR !*':''}\n\n${profileText(r.character)}${sep()}`);
    return extra.reply(`${banner('SOURCE DE SOIN','💧')}\n\n❤️ +*${r.healed} HP*\nHP : *${r.character.hp}/${r.character.maxHp}*${sep()}`);
  }
  if(['attack','attaque','frapper'].includes(sub)){
    const r=rpg.attack(extra.sender);
    if(r.error==='no-encounter')return extra.reply(`❌ Aucun monstre à combattre. Utilise *${prefix}rpg explore*.${sep()}`);
    if(r.won)return extra.reply(`${banner('VICTOIRE RPG','🏆')}\n\nTu infliges *${r.playerDamage}* dégâts et terrasses ${r.monster.emoji} *${r.monster.name}*.\n⭐ +*${r.xp} XP*  •  🪙 +*${r.coins} DC*${r.levelUp?'\n🌟 *NIVEAU RPG SUPÉRIEUR !*':''}\n\nHP : *${r.character.hp}/${r.character.maxHp}*  •  Potions : *${r.character.potions}*${sep()}`);
    if(r.lost)return extra.reply(`${banner('DÉFAITE RPG','💀')}\n\nTu infliges *${r.playerDamage}* dégâts, mais ${r.monster.emoji} *${r.monster.name}* te met K.O. avec *${r.monsterDamage}* dégâts.\n❤️ Tu récupères à *${r.character.hp}/${r.character.maxHp} HP*.${sep()}`);
    return extra.reply(`${banner('COMBAT','⚔️')}\n\n💥 Tu infliges *${r.playerDamage}* dégâts.\n💢 ${r.monster.name} riposte : *${r.monsterDamage}* dégâts.\n\n${monsterText(r.monster)}\n❤️ Toi : *${r.character.hp}/${r.character.maxHp}*\n➡️ *${prefix}rpg attack* / *potion* / *flee*${sep()}`);
  }
  if(['potion','heal','soin'].includes(sub)){
    const r=rpg.potion(extra.sender);if(r.error==='none')return extra.reply(`🧪 Tu n’as plus de potion.${sep()}`);if(r.error==='full')return extra.reply(`❤️ Tes HP sont déjà au maximum.${sep()}`);return extra.reply(`🧪 Potion utilisée : +*${r.healed} HP*.\n❤️ ${r.character.hp}/${r.character.maxHp}  •  Potions : *${r.character.potions}*${sep()}`);
  }
  if(['rest','repos'].includes(sub)){
    const r=rpg.rest(extra.sender);if(r.error==='encounter')return extra.reply(`⚔️ Impossible de se reposer pendant un combat.${sep()}`);if(r.error==='cooldown')return extra.reply(`🏕️ Repos disponible dans *${Math.ceil(r.remainingMs/60000)} min*.${sep()}`);return extra.reply(`🏕️ Repos terminé : +*${r.healed} HP*.\n❤️ ${r.character.hp}/${r.character.maxHp}${sep()}`);
  }
  if(['flee','fuire','fuite'].includes(sub)){
    const r=rpg.flee(extra.sender);if(r.error==='no-encounter')return extra.reply(`❌ Aucun combat à fuir.${sep()}`);return extra.reply(`🏃 Tu échappes à ${r.monster.emoji} *${r.monster.name}*. Aucun gain, aucun malus.${sep()}`);
  }
  return extra.reply(menu(prefix)+sep());
}
module.exports={SUPPORTED,menu,profileText,monsterText,executeRpg,bar,EXPLORE_COOLDOWN_MS,REST_COOLDOWN_MS};
