'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const MAX_TRACK_BYTES = Number(process.env.AUDIO_DJ_MAX_TRACK_BYTES || 35 * 1024 * 1024);
const MAX_QUEUE_TRACKS = Number(process.env.AUDIO_DJ_MAX_QUEUE_TRACKS || 8);
const QUEUE_TTL_MS = Number(process.env.AUDIO_DJ_QUEUE_TTL_MS || 30 * 60 * 1000);
const TIMEOUT_MS = Number(process.env.AUDIO_DJ_TIMEOUT_MS || 150000);
const queues = new Map();

function tmp(ext = 'bin') {
  return path.join(os.tmpdir(), `dipper-dj-${process.pid}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`);
}
function unwrap(message) {
  let m = message || {};
  for (let i = 0; i < 5; i++) {
    if (m.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
    if (m.viewOnceMessage?.message) { m = m.viewOnceMessage.message; continue; }
    if (m.viewOnceMessageV2?.message) { m = m.viewOnceMessageV2.message; continue; }
    if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
    break;
  }
  return m;
}
function mediaNode(msg) {
  const own = unwrap(msg?.message);
  const quoted = unwrap(own?.extendedTextMessage?.contextInfo?.quotedMessage);
  const m = quoted && Object.keys(quoted).length ? quoted : own;
  if (m.audioMessage) return { node: m.audioMessage, type: 'audio', ext: 'ogg', label: 'audio' };
  if (m.videoMessage) return { node: m.videoMessage, type: 'video', ext: 'mp4', label: 'video' };
  if (m.documentMessage) {
    const mime = String(m.documentMessage.mimetype || '');
    if (mime.startsWith('audio/') || mime.startsWith('video/')) {
      const ext = path.extname(m.documentMessage.fileName || '').slice(1) || (mime.startsWith('audio/') ? 'mp3' : 'mp4');
      return { node: m.documentMessage, type: 'document', ext, label: m.documentMessage.fileName || 'document' };
    }
  }
  return null;
}
async function toBuffer(stream, max = MAX_TRACK_BYTES) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > max) throw new Error(`Piste trop volumineuse (${Math.ceil(max / 1024 / 1024)} Mo max).`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function capture(msg) {
  const info = mediaNode(msg);
  if (!info) throw new Error('Réponds à un audio, une musique ou une vidéo.');
  const stream = await downloadContentFromMessage(info.node, info.type);
  return { buffer: await toBuffer(stream), ext: info.ext, label: info.label, addedAt: Date.now() };
}
function prune(chat) {
  const q = queues.get(chat) || [];
  const fresh = q.filter(x => Date.now() - x.addedAt < QUEUE_TTL_MS);
  if (fresh.length) queues.set(chat, fresh); else queues.delete(chat);
  return fresh;
}
async function enqueue(chat, msg) {
  if (!chat) throw new Error('Chat introuvable.');
  const item = await capture(msg);
  const q = prune(chat);
  if (q.length >= MAX_QUEUE_TRACKS) q.shift();
  q.push(item); queues.set(chat, q);
  return q.length;
}
function queueInfo(chat) { return prune(chat).map((x, i) => ({ index: i + 1, label: x.label, mb: (x.buffer.length / 1048576).toFixed(2) })); }
function clearQueue(chat) { queues.delete(chat); }
function removeTrack(chat, index) {
  const q = prune(chat); const i = Math.max(0, Number(index || q.length) - 1);
  if (!q[i]) return false; q.splice(i, 1); if (q.length) queues.set(chat, q); else queues.delete(chat); return true;
}
function materialize(item) { const file = tmp(item.ext || 'bin'); fs.writeFileSync(file, item.buffer); return file; }
function run(args, timeout = TIMEOUT_MS) {
  return new Promise((resolve, reject) => execFile(ffmpegPath, ['-hide_banner','-loglevel','error','-y',...args], { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message).trim().slice(0, 900))) : resolve({ stdout, stderr })));
}
async function duration(input) {
  return new Promise(resolve => execFile(ffmpegPath, ['-hide_banner','-i',input,'-f','null','-'], { timeout: 20000, maxBuffer: 2 * 1024 * 1024 }, (_e,_o,se) => {
    const m = String(se || '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/); resolve(m ? +m[1]*3600 + +m[2]*60 + +m[3] : 0);
  }));
}
async function rawPcm(input, rate = 8000, seconds = 90) {
  const out = tmp('s16le');
  await run(['-i',input,'-t',String(seconds),'-vn','-ac','1','-ar',String(rate),'-f','s16le',out], 90000);
  const b = fs.readFileSync(out); try { fs.unlinkSync(out); } catch (_) {}
  return new Int16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2));
}
function estimateBpmFromPcm(pcm, rate) {
  const hop = Math.max(32, Math.round(rate * 0.01));
  const env = [];
  for (let i = 0; i + hop <= pcm.length; i += hop) {
    let sum = 0; for (let j = 0; j < hop; j++) sum += Math.abs(pcm[i+j]); env.push(sum / hop);
  }
  if (env.length < 400) return 0;
  const onset = new Float64Array(env.length);
  let mean = 0;
  for (let i = 1; i < env.length; i++) { onset[i] = Math.max(0, env[i] - env[i-1]); mean += onset[i]; }
  mean /= onset.length;
  for (let i = 0; i < onset.length; i++) onset[i] = Math.max(0, onset[i] - mean * 0.5);
  let bestLag = 0, best = -Infinity;
  const hz = 1000 / (hop * 1000 / rate);
  const minLag = Math.floor(hz * 60 / 200), maxLag = Math.ceil(hz * 60 / 60);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0; for (let i = lag; i < onset.length; i++) s += onset[i] * onset[i-lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  if (!bestLag) return 0;
  let bpm = 60 * hz / bestLag;
  while (bpm < 75) bpm *= 2; while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}
async function estimateBpm(input) { return estimateBpmFromPcm(await rawPcm(input, 8000, 90), 8000); }

const NOTE_NAMES = ['C','C♯/D♭','D','D♯/E♭','E','F','F♯/G♭','G','G♯/A♭','A','A♯/B♭','B'];
function goertzel(samples, rate, freq, stride = 4) {
  const w = 2 * Math.PI * freq / (rate / stride), c = 2 * Math.cos(w); let s0=0,s1=0,s2=0;
  for (let i=0;i<samples.length;i+=stride) { s0 = samples[i] + c*s1 - s2; s2=s1; s1=s0; }
  return s1*s1 + s2*s2 - c*s1*s2;
}
async function detectKey(input) {
  const rate = 11025; const pcm = await rawPcm(input, rate, 35);
  if (pcm.length < rate) return { key: 'Inconnue', confidence: 0 };
  const chroma = Array(12).fill(0);
  for (let pc=0;pc<12;pc++) {
    for (let oct=2;oct<=6;oct++) {
      const midi = 12 * (oct + 1) + pc; const freq = 440 * Math.pow(2, (midi - 69) / 12);
      if (freq < rate / 8) chroma[pc] += goertzel(pcm, rate, freq);
    }
  }
  const total = chroma.reduce((a,b)=>a+b,0) || 1; for(let i=0;i<12;i++) chroma[i]/=total;
  let best={score:-1,root:0,minor:false}, second=-1;
  for(let root=0;root<12;root++) for(const minor of [false,true]) {
    const third=(root+(minor?3:4))%12, fifth=(root+7)%12;
    const score=chroma[root]*1.35+chroma[third]*1.0+chroma[fifth]*1.15+chroma[(root+2)%12]*0.15+chroma[(root+9)%12]*0.15;
    if(score>best.score){second=best.score;best={score,root,minor};} else if(score>second) second=score;
  }
  const confidence=Math.max(0,Math.min(99,Math.round((best.score-Math.max(0,second))*900+45)));
  return { key: `${NOTE_NAMES[best.root]} ${best.minor?'mineur':'majeur'}`, confidence, chroma };
}
function atempoChain(v) { const p=[]; while(v>2){p.push('atempo=2');v/=2;} while(v<0.5){p.push('atempo=0.5');v/=0.5;} p.push(`atempo=${v.toFixed(5)}`); return p.join(','); }
async function mixFiles(inputs, mode='mix', options={}) {
  if (!inputs || inputs.length < 2) throw new Error('Ajoute au moins deux pistes à la file audio avec `.queueaudio`.');
  const output = tmp('mp3');
  const ff=[]; inputs.forEach(f=>ff.push('-i',f));
  if (mode === 'join' || mode === 'joinaudio') {
    const labels=inputs.map((_,i)=>`[${i}:a]`).join(''); ff.push('-filter_complex',`${labels}concat=n=${inputs.length}:v=0:a=1[out]`,'-map','[out]');
  } else if (mode === 'crossfade' || mode === 'blend' || mode === 'transition' || mode === 'djmix' || mode === 'autodj') {
    const d=Math.max(0.5,Math.min(15,Number(options.fade)||5));
    let graph='[0:a][1:a]acrossfade=d='+d+':c1=tri:c2=tri[x1]'; let last='x1';
    for(let i=2;i<inputs.length;i++){const n=`x${i}`;graph+=`;[${last}][${i}:a]acrossfade=d=${d}:c1=tri:c2=tri[${n}]`;last=n;}
    ff.push('-filter_complex',graph,'-map',`[${last}]`);
  } else if (mode === 'beatmatch' || mode === 'syncbpm') {
    const bpms=[]; for(const f of inputs) bpms.push(await estimateBpm(f)); const target=bpms[0]||120;
    const chains=inputs.map((_,i)=>`[${i}:a]${atempoChain(target/(bpms[i]||target))}[a${i}]`).join(';');
    ff.push('-filter_complex',`${chains};${inputs.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${inputs.length}:duration=longest:normalize=0[out]`,'-map','[out]');
  } else {
    ff.push('-filter_complex',`${inputs.map((_,i)=>`[${i}:a]`).join('')}amix=inputs=${inputs.length}:duration=longest:dropout_transition=3:normalize=0[out]`,'-map','[out]');
  }
  ff.push('-vn','-c:a','libmp3lame','-b:a','192k',output); await run(ff); return output;
}
async function processQueue(chat, mode, options={}) {
  const q=prune(chat); if(q.length<2) throw new Error('La file audio contient moins de 2 pistes. Utilise `.queueaudio` sur deux audios.');
  const files=q.map(materialize); try { return await mixFiles(files,mode,options); } finally { files.forEach(f=>{try{fs.unlinkSync(f)}catch(_){}}); }
}
async function analyzeQueued(chat, index=1) {
  const q=prune(chat); const item=q[Math.max(0,Number(index)-1)]; if(!item) throw new Error('Piste absente de la file audio.');
  const f=materialize(item); try { return { bpm: await estimateBpm(f), key: await detectKey(f), seconds: await duration(f) }; } finally { try{fs.unlinkSync(f)}catch(_){} }
}
function cleanup(...files){for(const f of files.flat().filter(Boolean)){try{fs.unlinkSync(f)}catch(_){}}}
module.exports={enqueue,queueInfo,clearQueue,removeTrack,processQueue,analyzeQueued,estimateBpm,detectKey,mixFiles,cleanup,MAX_QUEUE_TRACKS};