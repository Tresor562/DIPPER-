'use strict';
const fs=require('fs');const path=require('path');const{spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..');const file=path.join(ROOT,'commands','general_tools','menu.js');const MARK='[STYLE MENU V2 32]';
if(!fs.existsSync(file))throw new Error('[style-menu-v2] menu.js absent');let src=fs.readFileSync(file,'utf8');
function once(from,to,label){if(src.includes(to))return;if(!src.includes(from))throw new Error(`[style-menu-v2] ${label} introuvable`);src=src.replace(from,to);}
if(!src.includes(MARK)){
  once("const styleManager = require('../../utils/styleManager');",`const styleManager = require('../../utils/styleManager');\nconst { MAX_STYLE, getTheme, buildMenuHeader: buildThemeMenuHeader } = require('../../utils/styleCatalog'); // ${MARK}\nconst { getStyleImageBuffer } = require('../../utils/styleMedia');`,'import styleManager');
  once('async function getImageBufferForStyle(styleNum) {','async function getImageBufferForStyle(styleNum) {\n  if (styleNum > 20) return getStyleImageBuffer(styleNum);','image resolver');
  const signature="function buildImmersiveHeader(style, senderJid, count, botName, displayName = '') {";
  if(src.includes(signature)&&!src.includes('[THEME HEADER 21-31]'))src=src.replace(signature,signature+"\n  if (style > 20) { // [THEME HEADER 21-31]\n    const user = (typeof sanitizeDisplayName === 'function' ? sanitizeDisplayName(displayName) : String(displayName || '')) || formatUser(senderJid);\n    return buildThemeMenuHeader(style, { user, rank: 'Utilisateur', prefix, count });\n  }");
  else if(!src.includes('[THEME HEADER 21-31]'))throw new Error('[style-menu-v2] signature buildImmersiveHeader introuvable');
  src=src.replace("'style16','style17','style18','style19','style20'],","'style16','style17','style18','style19','style20',\n    'style21','style22','style23','style24','style25','style26','style27','style28','style29','style30','style31'],");
  src=src.replaceAll('.style0 → .style20','.style0 → .style31').replaceAll('.style0 … .style20','.style0 … .style31');
  src=src.replace('if (num < 0 || num > 20) {','if (num < 0 || num > MAX_STYLE) {');
  src=src.replace('`ᴄʜᴏɪsɪs ᴇɴᴛʀᴇ \\`${prefix}style0\\` ᴇᴛ \\`${prefix}style20\\`\\n\\n` +','`ᴄʜᴏɪsɪs ᴇɴᴛʀᴇ \\`${prefix}style0\\` ᴇᴛ \\`${prefix}style${MAX_STYLE}\\`\\n\\n` +');
  src=src.replace('STYLE_CONFIRM[num] +','(STYLE_CONFIRM[num] || `✅ *${getTheme(num).name} activé*`) +');
  src=src.replace('  const botName   = customCfg.title || config.botName || \'𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑\';','  let botName   = customCfg.title || config.botName || \'𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑\';');
  const styleBlock="  const styleActif    = (customCfg.style !== undefined && customCfg.style !== null)\n    ? customCfg.style\n    : styleManager.getStyle();";
  if(src.includes(styleBlock)&&!src.includes('[THEME BOT NAME]'))src=src.replace(styleBlock,styleBlock+"\n  if (!customCfg.title) botName = getTheme(styleActif).botName; // [THEME BOT NAME]");
  if(!src.includes('[STYLELIST HINT]')){
    const needle='return disciplineMenuText(text);';
    const idx=src.indexOf(needle);
    if(idx>=0)src=src.slice(0,idx)+"text += `\\n\\n➜ \\`${prefix}stylelist\\`\\nAffiche tous les styles disponibles et explique comment les activer.`; // [STYLELIST HINT]\n  "+src.slice(idx);
  }
}
fs.writeFileSync(file,src,'utf8');const chk=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(chk.status!==0)throw new Error('[style-menu-v2] syntaxe menu: '+(chk.stderr||chk.stdout));
const final=fs.readFileSync(file,'utf8');for(const token of[MARK,'style31','MAX_STYLE','[THEME HEADER 21-31]','[THEME BOT NAME]'])if(!final.includes(token))throw new Error('[style-menu-v2] garde-fou absent '+token);
console.log('[style-menu-v2] ✅ menu étendu à 32 styles + nom thématique + fallback média');
