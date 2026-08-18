'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const MAX_INPUT_BYTES = Number(process.env.AUDIO_LAB_MAX_BYTES || 35 * 1024 * 1024);
const MAX_OUTPUT_BYTES = Number(process.env.AUDIO_LAB_MAX_OUTPUT_BYTES || 45 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.AUDIO_LAB_TIMEOUT_MS || 120000);

function tmp(ext = 'bin') {
  return path.join(os.tmpdir(), `dipper-audio-${process.pid}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`);
}

function unwrap(message) {
  let m = message || {};
  for (let i = 0; i < 8; i++) {
    if (m.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
    if (m.viewOnceMessage?.message) { m = m.viewOnceMessage.message; continue; }
    if (m.viewOnceMessageV2?.message) { m = m.viewOnceMessageV2.message; continue; }
    if (m.viewOnceMessageV2Extension?.message) { m = m.viewOnceMessageV2Extension.message; continue; }
    if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
    break;
  }
  return m || {};
}

function contextInfoOf(message) {
  const m = unwrap(message);
  return (
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.buttonsResponseMessage?.contextInfo ||
    m.listResponseMessage?.contextInfo ||
    m.templateButtonReplyMessage?.contextInfo ||
    m.interactiveResponseMessage?.contextInfo ||
    null
  );
}

function findMedia(message) {
  const m = unwrap(message);
  if (m.audioMessage) return { node: m.audioMessage, type: 'audio', ext: 'ogg' };
  if (m.videoMessage) return { node: m.videoMessage, type: 'video', ext: 'mp4' };
  if (m.documentMessage) {
    const mime = String(m.documentMessage.mimetype || '');
    if (mime.startsWith('audio/') || mime.startsWith('video/')) {
      const ext = path.extname(m.documentMessage.fileName || '').replace('.', '') || (mime.startsWith('audio/') ? 'mp3' : 'mp4');
      return { node: m.documentMessage, type: 'document', ext };
    }
  }
  return null;
}

function mediaNode(msg) {
  // 1) Toujours privilégier le média cité. Sur WhatsApp le contextInfo peut
  // vivre dans plusieurs types de messages (texte, image, vidéo, document,
  // message interactif...), pas uniquement dans extendedTextMessage.
  const roots = [msg?._unwrappedMessage, msg?.message].filter(Boolean);
  for (const root of roots) {
    const ctx = contextInfoOf(root);
    if (ctx?.quotedMessage) {
      const quoted = findMedia(ctx.quotedMessage);
      if (quoted) return quoted;
    }
  }

  // 2) Compatibilité avec certains normaliseurs/versions Baileys qui exposent
  // directement le message cité sous msg.quoted / msg.quotedMessage.
  for (const candidate of [msg?.quoted?.message, msg?.quotedMessage, msg?.quoted]) {
    if (!candidate) continue;
    const quoted = findMedia(candidate);
    if (quoted) return quoted;
  }

  // 3) Autoriser aussi l'effet lorsqu'il est lancé directement sur un message
  // média portant la commande en légende.
  for (const root of roots) {
    const direct = findMedia(root);
    if (direct) return direct;
  }
  return null;
}

async function streamToBuffer(stream, max = MAX_INPUT_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > max) throw new Error(`Fichier trop volumineux (${Math.ceil(max / 1024 / 1024)} Mo max)`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function downloadInput(msg) {
  const info = mediaNode(msg);
  if (!info) throw new Error('Réponds à un audio, une musique ou une vidéo.');
  const stream = await downloadContentFromMessage(info.node, info.type);
  const buffer = await streamToBuffer(stream);
  if (!buffer?.length) throw new Error('Le média cité est vide ou n’est plus téléchargeable.');
  const file = tmp(info.ext);
  fs.writeFileSync(file, buffer);
  return file;
}

function runFfmpeg(args, timeout = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).trim().slice(0, 700)));
      resolve({ stdout, stderr });
    });
  });
}

async function probeDuration(input) {
  try {
    const { stdout } = await new Promise((resolve) => {
      execFile(ffmpegPath, ['-hide_banner', '-i', input, '-f', 'null', '-'], { timeout: 20000 }, (err, stdout, stderr) => {
        const text = String(stderr || stdout || '');
        const m = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (!m) return resolve({ stdout: '0' });
        resolve({ stdout: String(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) });
      });
    });
    return Number(stdout) || 0;
  } catch { return 0; }
}

function clamp(n, min, max, dflt) {
  n = Number(n);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

function atempoChain(speed) {
  let v = clamp(speed, 0.25, 4, 1);
  const parts = [];
  while (v > 2) { parts.push('atempo=2'); v /= 2; }
  while (v < 0.5) { parts.push('atempo=0.5'); v /= 0.5; }
  parts.push(`atempo=${v.toFixed(5)}`);
  return parts.join(',');
}

const PRESETS = {
  eqclub: 'equalizer=f=80:t=q:w=1:g=5,equalizer=f=12000:t=q:w=1:g=3',
  eqbassboost: 'bass=g=10:f=90:w=0.6',
  eqvocal: 'highpass=f=100,lowpass=f=12000,equalizer=f=3000:t=q:w=1:g=5',
  eqrock: 'bass=g=5:f=100,treble=g=4:f=8000,equalizer=f=1000:t=q:w=1:g=-2',
  eqpop: 'bass=g=3:f=100,treble=g=3:f=9000,equalizer=f=2500:t=q:w=1:g=2',
  eqelectro: 'bass=g=8:f=80,treble=g=5:f=10000',
  eqhiphop: 'bass=g=9:f=70,equalizer=f=250:t=q:w=1:g=2,treble=g=2',
  eqcinema: 'bass=g=4,treble=g=3,stereotools=mlev=1.15:slev=1.25',
  bassboost: 'bass=g=12:f=80:w=0.6,alimiter=limit=0.95',
  superbass: 'bass=g=18:f=70:w=0.5,acompressor=threshold=0.1:ratio=4,alimiter=limit=0.92',
  nightcore: 'asetrate=48000*1.18,aresample=48000,atempo=1.06',
  slowed: 'asetrate=48000*0.88,aresample=48000,atempo=1.02',
  slowedreverb: 'asetrate=48000*0.88,aresample=48000,aecho=0.8:0.75:60|120:0.35|0.22',
  flanger: 'flanger', chorus: 'chorus=0.5:0.9:50|60:0.4|0.3:0.25|0.4:2|2.3', phaser: 'aphaser',
  tremolo: 'tremolo=f=5:d=0.6', vibrato: 'vibrato=f=5:d=0.5',
  distortion: 'acrusher=bits=8:mix=0.65', overdrive: 'acompressor=threshold=0.15:ratio=6,volume=1.7,alimiter=0.9',
  lofi: 'aresample=22050,lowpass=f=5500,highpass=f=100,acompressor=threshold=0.2:ratio=3',
  vinyl: 'highpass=f=80,lowpass=f=9000,acrusher=bits=12:mix=0.18', radio: 'highpass=f=300,lowpass=f=3400,acompressor=ratio=4',
  telephone: 'highpass=f=400,lowpass=f=3000', underwater: 'lowpass=f=800,aecho=0.7:0.65:80:0.25',
  '8d': 'apulsator=hz=0.12', '3d': 'stereotools=mlev=0.9:slev=1.5', stereo: 'stereotools=slev=1.45', mono: 'pan=mono|c0=0.5*c0+0.5*c1',
  vocalboost: 'highpass=f=90,equalizer=f=3000:t=q:w=1:g=6,acompressor=threshold=0.15:ratio=3',
  vocalreduce: 'pan=stereo|c0=c0-c1|c1=c1-c0', removevocals: 'pan=stereo|c0=c0-c1|c1=c1-c0', instrumental: 'pan=stereo|c0=c0-c1|c1=c1-c0',
  acapella: 'pan=mono|c0=0.5*c0+0.5*c1,highpass=f=120,lowpass=f=8000,equalizer=f=2500:t=q:w=1:g=4',
  denoise: 'afftdn=nf=-25', dehum: 'highpass=f=70,bandreject=f=50:w=3,bandreject=f=60:w=3', deess: 'equalizer=f=6500:t=q:w=2:g=-5',
  compressor: 'acompressor=threshold=0.12:ratio=4:attack=20:release=250', limiter: 'alimiter=limit=0.90', gate: 'agate=threshold=0.03:ratio=8',
  master: 'highpass=f=25,acompressor=threshold=0.12:ratio=3,loudnorm=I=-14:TP=-1.2:LRA=9',
  masterclub: 'bass=g=4:f=90,acompressor=threshold=0.1:ratio=4,loudnorm=I=-10:TP=-1:LRA=7',
  masterloud: 'acompressor=threshold=0.08:ratio=5,loudnorm=I=-9:TP=-0.8:LRA=6',
  masterclean: 'afftdn=nf=-28,highpass=f=35,loudnorm=I=-14:TP=-1.5:LRA=10',
  masterbass: 'bass=g=6:f=85,acompressor=threshold=0.1:ratio=4,loudnorm=I=-11:TP=-1:LRA=8',
  mastervocal: 'highpass=f=90,equalizer=f=3000:t=q:w=1:g=4,deesser=i=0.4:m=0.5:f=0.5,acompressor=threshold=0.12:ratio=3,loudnorm=I=-14:TP=-1.2:LRA=8'
};

function filterFor(name, args = []) {
  const a = String(name).toLowerCase();
  if (PRESETS[a]) return PRESETS[a];
  if (a === 'bass') return `bass=g=${clamp(args[0], -20, 20, 6)}:f=100`;
  if (a === 'treble') return `treble=g=${clamp(args[0], -20, 20, 5)}:f=8000`;
  if (a === 'mid') return `equalizer=f=1200:t=q:w=1:g=${clamp(args[0], -20, 20, 4)}`;
  if (a === 'equalizer') return PRESETS[String(args[0] || '').toLowerCase()] || PRESETS.eqclub;
  if (a === 'reverb') return `aecho=0.8:0.75:${clamp(args[0], 20, 500, 80)}:0.35`;
  if (a === 'echo') return `aecho=0.8:0.8:${clamp(args[0], 20, 1000, 120)}:0.45`;
  if (a === 'delay') return `adelay=${clamp(args[0], 1, 5000, 250)}|${clamp(args[0], 1, 5000, 250)}`;
  if (a === 'speed') return atempoChain(clamp(args[0], 0.25, 4, 1.25));
  if (a === 'tempo') return atempoChain(clamp(args[0], 40, 240, 120) / 120);
  if (a === 'pitch' || a === 'key') { const st = clamp(args[0], -12, 12, 2); const f = Math.pow(2, st / 12); return `asetrate=48000*${f.toFixed(6)},aresample=48000,${atempoChain(1/f)}`; }
  if (a === 'pitchup') return filterFor('pitch', [3]);
  if (a === 'pitchdown') return filterFor('pitch', [-3]);
  if (a === 'fadein') return `afade=t=in:st=0:d=${clamp(args[0], .1, 30, 3)}`;
  if (a === 'fadeout') return `areverse,afade=t=in:st=0:d=${clamp(args[0], .1, 30, 3)},areverse`;
  if (a === 'normalize') return 'loudnorm=I=-16:TP=-1.5:LRA=11';
  if (a === 'volume') return `volume=${clamp(args[0], 0, 5, 1.5)}`;
  if (a === 'boostvolume') return 'volume=2.2,alimiter=0.95';
  if (a === 'reverse') return 'areverse';
  if (a === 'lowpass') return `lowpass=f=${clamp(args[0], 50, 20000, 1200)}`;
  if (a === 'highpass') return `highpass=f=${clamp(args[0], 20, 18000, 250)}`;
  if (a === 'bandpass') return `bandpass=f=${clamp(args[0], 50, 18000, 1000)}:w=300`;
  if (a === 'filterin') return 'highpass=f=700,afade=t=in:d=4';
  if (a === 'filterout') return 'lowpass=f=1800,areverse,afade=t=in:d=4,areverse';
  if (a === 'builddup') return 'volume=1.15,highpass=f=120,acompressor=threshold=0.12:ratio=3';
  if (a === 'drop') return 'bass=g=10:f=80,volume=1.25,alimiter=0.93';
  return null;
}

async function processAudio(input, operation, args = []) {
  const output = tmp('mp3');
  const op = String(operation).toLowerCase();
  const ff = ['-i', input];
  if (op === 'trim' || op === 'cut') {
    const start = clamp(args[0], 0, 86400, 0);
    const end = clamp(args[1], start + 0.1, 86400, start + 30);
    ff.push('-ss', String(start), '-t', String(end - start));
  } else if (op === 'removeintro') {
    ff.push('-ss', String(clamp(args[0], 0, 3600, 10)));
  } else if (op === 'removeoutro') {
    const dur = await probeDuration(input); const cut = clamp(args[0], 0, dur, 10); ff.push('-t', String(Math.max(0.1, dur - cut)));
  } else if (op === 'loop') {
    const n = Math.round(clamp(args[0], 1, 10, 2)); ff.unshift('-stream_loop', String(n - 1));
  } else if (op === 'silence') {
    const st = clamp(args[0], 0, 86400, 0), en = clamp(args[1], st, 86400, st + 5);
    ff.push('-af', `volume=enable='between(t,${st},${en})':volume=0`);
  } else {
    const filter = filterFor(op, args);
    if (!filter) throw new Error(`Effet ${operation} non configuré.`);
    ff.push('-af', filter);
  }
  ff.push('-vn', '-c:a', 'libmp3lame', '-b:a', '192k', output);
  await runFfmpeg(ff);
  const st = fs.statSync(output);
  if (st.size > MAX_OUTPUT_BYTES) throw new Error('Sortie audio trop volumineuse pour WhatsApp.');
  return output;
}

async function analyze(input) {
  const duration = await probeDuration(input);
  const st = fs.statSync(input);
  return { duration, bytes: st.size, mb: (st.size / 1024 / 1024).toFixed(2) };
}

async function waveform(input) {
  const output = tmp('png');
  await runFfmpeg(['-i', input, '-filter_complex', 'showwavespic=s=1280x360:colors=white', '-frames:v', '1', output]);
  return output;
}

async function spectrogram(input) {
  const output = tmp('png');
  await runFfmpeg(['-i', input, '-lavfi', 'showspectrumpic=s=1280x720:legend=disabled', '-frames:v', '1', output]);
  return output;
}

function cleanup(...files) { for (const f of files) { if (!f) continue; try { fs.unlinkSync(f); } catch (_) {} } }

module.exports = { downloadInput, processAudio, analyze, waveform, spectrogram, cleanup, filterFor, mediaNode, contextInfoOf, unwrap };
