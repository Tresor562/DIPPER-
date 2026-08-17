'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const COMMANDS = path.join(ROOT, 'commands');
const REPORT = path.join(ROOT, 'response-style-audit.json');
const FORBIDDEN = /[╭╮╰╯┃║╔╗╚╝╠╣╦╩╬┌┐└┘│≪≫╼╾]/u;
const HEAVY = /[╭╮╰╯┃║╔╗╚╝╠╣╦╩╬┌┐└┘│≪≫╼╾]/gu;

function walk(dir) { const out=[]; for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())out.push(...walk(full));else if(entry.isFile()&&entry.name.endsWith('.js'))out.push(full)} return out; }
const files=walk(COMMANDS),details=[],syntaxFailures=[];let rawOccurrences=0;
for(const file of files){const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(syntax.status!==0)syntaxFailures.push({file:path.relative(ROOT,file),error:(syntax.stderr||syntax.stdout||'').trim()});const src=fs.readFileSync(file,'utf8'),matches=src.match(HEAVY)||[];if(!matches.length)continue;rawOccurrences+=matches.length;const lines=src.split(/\r?\n/),affectedLines=[];for(let i=0;i<lines.length;i++)if(FORBIDDEN.test(lines[i]))affectedLines.push(i+1);details.push({file:path.relative(ROOT,file).replace(/\\/g,'/'),occurrences:matches.length,lines:affectedLines})}
const handler=fs.readFileSync(path.join(ROOT,'handler.js'),'utf8');
// Audit sémantique : disciplinedPayload peut être enveloppé par un décorateur tardif
// (ex. OWNER RESPONSE HEADER) sans supprimer la discipline centrale.
const hasDisciplinedPayload = /const\s+disciplinedPayload\s*=\s*[^;]*decoratePayload\s*\(\s*payload\s*\)[^;]*;/s.test(handler);
const usesDisciplinedPayload = /await\s+_orig\s*\(\s*jid\s*,\s*disciplinedPayload\s*,\s*(?:disciplinedOpts|retryOpts)\s*\)/s.test(handler);
const runtimeGuardInstalled=handler.includes('[RESPONSE STYLE DISCIPLINE]')&&hasDisciplinedPayload&&usesDisciplinedPayload;
const disciplinedPhrasesInstalled=handler.includes('[RESPONSE STYLE PHRASES]')&&handler.includes("getLegacyPhrases()")&&handler.includes("renderResponse: require('./utils/responseStyle').renderResponse");
const privateSendSafetyInstalled=handler.includes('[PRIVATE SEND SAFETY]')&&handler.includes('if (isPrivateSend && opts?.quoted)')&&handler.includes('disciplinedOpts = Object.keys(restOpts).length ? restOpts : undefined');
const commandErrorFallbackInstalled=handler.includes('[COMMAND ERROR RESPONSE]')&&handler.includes('const errText = errMsgs[Math.floor(Math.random() * errMsgs.length)]');
const report={generatedAt:new Date().toISOString(),commandFiles:files.length,syntaxFailures,filesWithLegacyDecoration:details.length,rawOccurrences,runtimeGuardInstalled,disciplinedPhrasesInstalled,privateSendSafetyInstalled,commandErrorFallbackInstalled,details,note:'Les occurrences brutes sont un inventaire de dette visuelle dans le source. Les text/caption réellement envoyés passent par le garde-fou central. Le garde-fou est validé sémantiquement afin de rester compatible avec les décorateurs tardifs de payload.'};
fs.writeFileSync(REPORT,JSON.stringify(report,null,2));
console.log(`[visual-audit] commandes=${report.commandFiles} syntaxe_ko=${syntaxFailures.length} fichiers_legacy=${report.filesWithLegacyDecoration} occurrences=${rawOccurrences} garde_fou=${runtimeGuardInstalled?'OK':'ABSENT'} phrases=${disciplinedPhrasesInstalled?'OK':'ABSENT'} privé=${privateSendSafetyInstalled?'OK':'ABSENT'} erreurs=${commandErrorFallbackInstalled?'OK':'ABSENT'}`);
if(syntaxFailures.length||!runtimeGuardInstalled||!disciplinedPhrasesInstalled||!privateSendSafetyInstalled||!commandErrorFallbackInstalled)process.exitCode=1;
