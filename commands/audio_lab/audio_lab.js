'use strict';

const fs = require('fs');
const engine = require('../../utils/audioLabEngine');

const CATEGORY = '🎚️ AUDIO LAB / DJ TOOLS';

function formatError(err) {
  const m = String(err?.message || err || 'Erreur inconnue');
  return `❌ *Audio Lab*\n${m.length > 500 ? m.slice(0, 500) + '…' : m}`;
}

function effectCommand(name, description, usage = '') {
  return {
    name,
    aliases: [],
    category: CATEGORY,
    description,
    usage: `.${name}${usage ? ' ' + usage : ''}`,
    async execute(sock, msg, args, extra) {
      const { reply, from, phrases } = extra;
      let input, output;
      try {
        await reply(`🎚️ *Audio Lab* — traitement \`${name}\` en cours…`);
        input = await engine.downloadInput(msg);
        output = await engine.processAudio(input, name, args);
        await sock.sendMessage(from, {
          audio: fs.readFileSync(output),
          mimetype: 'audio/mpeg',
          fileName: `DIPPER-${name}.mp3`,
          ptt: false,
        }, from?.endsWith('@g.us') ? { quoted: msg } : undefined);
      } catch (err) {
        await reply(formatError(err));
      } finally {
        engine.cleanup(input, output);
      }
    }
  };
}

const defs = [
  ['bass','Augmenter ou réduire les basses','<niveau -20..20>'],
  ['treble','Régler les aigus','<niveau -20..20>'],
  ['mid','Régler les médiums','<niveau -20..20>'],
  ['equalizer','Appliquer un preset EQ','<eqclub|eqrock|eqpop|eqelectro|eqhiphop|eqcinema|eqvocal|eqbassboost>'],
  ['eqclub','Preset égaliseur club'],['eqbassboost','Preset bass boost'],['eqvocal','Preset voix'],['eqrock','Preset rock'],['eqpop','Preset pop'],['eqelectro','Preset électro'],['eqhiphop','Preset hip-hop'],['eqcinema','Preset cinéma'],
  ['bassboost','Renforcer fortement les basses'],['superbass','Bass boost agressif'],['nightcore','Effet nightcore'],['slowed','Version ralentie'],['slowedreverb','Slowed + reverb'],
  ['reverb','Réverbération','<niveau/ms>'],['echo','Écho','<ms>'],['delay','Délai audio','<ms>'],['flanger','Effet flanger'],['chorus','Effet chorus'],['phaser','Effet phaser'],['tremolo','Effet tremolo'],['vibrato','Effet vibrato'],['distortion','Distorsion'],['overdrive','Overdrive'],['lofi','Effet lo-fi'],['vinyl','Couleur vinyle'],['radio','Effet radio'],['telephone','Effet téléphone'],['underwater','Effet sous-marin'],['8d','Panoramique 8D'],['3d','Spatialisation 3D'],['stereo','Élargissement stéréo'],['mono','Conversion mono'],
  ['speed','Changer la vitesse','<0.25-4>'],['tempo','Changer le tempo','<bpm>'],['pitch','Changer le pitch','<demi-tons>'],['pitchup','Pitch +3 demi-tons'],['pitchdown','Pitch -3 demi-tons'],['key','Transposer la tonalité','<demi-tons>'],
  ['trim','Découper un extrait','<début_sec> <fin_sec>'],['cut','Extraire une portion','<début_sec> <fin_sec>'],['fadein','Fondu entrant','<sec>'],['fadeout','Fondu sortant','<sec>'],['normalize','Normaliser le volume'],['volume','Régler le volume','<0-5>'],['boostvolume','Booster le volume'],['silence','Mettre une zone en silence','<début_sec> <fin_sec>'],['reverse','Inverser le son'],['loop','Boucler le morceau','<1-10>'],['removeintro','Retirer le début','<sec>'],['removeoutro','Retirer la fin','<sec>'],
  ['filterin','Entrée filtrée'],['filterout','Sortie filtrée'],['lowpass','Filtre passe-bas','<hz>'],['highpass','Filtre passe-haut','<hz>'],['bandpass','Filtre passe-bande','<hz>'],['drop','Accentuer un drop'],['builddup','Créer une montée simple'],
  ['vocalboost','Renforcer les voix'],['vocalreduce','Réduire la voix centrale'],['removevocals','Réduction de voix centrale'],['instrumental','Approximation instrumentale'],['acapella','Approximation voix'],['denoise','Réduire le bruit'],['dehum','Réduire ronflement 50/60 Hz'],['deess','Réduire les sifflantes'],['compressor','Compresseur'],['limiter','Limiteur'],['gate','Noise gate'],
  ['master','Mastering automatique'],['masterclub','Mastering club'],['masterloud','Mastering fort'],['masterclean','Mastering propre'],['masterbass','Mastering bass'],['mastervocal','Mastering vocal']
];

const commands = defs.map(d => effectCommand(...d));

commands.push({
  name: 'analyzesound', aliases: ['audiostats'], category: CATEGORY,
  description: 'Analyse durée et poids de l’audio', usage: '.analyzesound (répondre à un audio)',
  async execute(sock, msg, args, extra) {
    const { reply, phrases } = extra; let input;
    try {
      input = await engine.downloadInput(msg);
      const a = await engine.analyze(input);
      await reply(`📊 *Analyse audio*\n\n⏱️ Durée : ${a.duration.toFixed(2)} s\n💾 Taille : ${a.mb} Mo\n🎛️ Moteur : FFmpeg\n\n${phrases?.footer?.() || ''}`);
    } catch (e) { await reply(formatError(e)); } finally { engine.cleanup(input); }
  }
});

commands.push({
  name: 'waveform', aliases: [], category: CATEGORY, description: 'Génère la forme d’onde', usage: '.waveform',
  async execute(sock, msg, args, extra) { const { reply, from } = extra; let i,o; try { i=await engine.downloadInput(msg); o=await engine.waveform(i); await sock.sendMessage(from,{image:fs.readFileSync(o),caption:'〽️ *Waveform — THE BIG DIPPER*'},{quoted:msg}); } catch(e){await reply(formatError(e));} finally{engine.cleanup(i,o);} }
});

commands.push({
  name: 'spectrogram', aliases: [], category: CATEGORY, description: 'Génère un spectrogramme', usage: '.spectrogram',
  async execute(sock, msg, args, extra) { const { reply, from } = extra; let i,o; try { i=await engine.downloadInput(msg); o=await engine.spectrogram(i); await sock.sendMessage(from,{image:fs.readFileSync(o),caption:'🌈 *Spectrogramme — THE BIG DIPPER*'},{quoted:msg}); } catch(e){await reply(formatError(e));} finally{engine.cleanup(i,o);} }
});

// Commandes multi-pistes : un premier jalon utile et explicite. Elles n’inventent
// pas un résultat si deux sources audio ne sont pas disponibles dans un seul message.
for (const [name, desc] of [
  ['mix','Mixer deux pistes'],['blend','Fusion progressive'],['djmix','Mix DJ automatique'],['crossfade','Crossfade entre deux pistes'],['beatmatch','Aligner deux pistes'],['autodj','Mix automatique de plusieurs pistes'],['syncbpm','Synchroniser les BPM'],['transition','Transition DJ'],['joinaudio','Fusionner plusieurs pistes'],['splitbeat','Découper par segments']
]) {
  commands.push({ name, aliases: [], category: CATEGORY, description: desc, usage: `.${name}`, async execute(sock,msg,args,extra){ await extra.reply(`🎛️ *${name}* nécessite deux pistes. Le moteur multi-pistes sera branché sur la file média du chat ; pour l’instant utilise les traitements mono-piste déjà actifs.`); } });
}

commands.push({
  name:'bpm', aliases:[], category:CATEGORY, description:'Analyse BPM (préparation moteur)', usage:'.bpm',
  async execute(sock,msg,args,extra){ await extra.reply('🥁 La détection BPM avancée nécessite un analyseur dédié. Les effets de tempo FFmpeg sont déjà actifs via `.tempo`.'); }
});
commands.push({
  name:'keydetect', aliases:[], category:CATEGORY, description:'Détection de tonalité (préparation moteur)', usage:'.keydetect',
  async execute(sock,msg,args,extra){ await extra.reply('🎼 La détection de tonalité avancée nécessite un analyseur dédié. La transposition est déjà active via `.key`.'); }
});

module.exports = commands;
