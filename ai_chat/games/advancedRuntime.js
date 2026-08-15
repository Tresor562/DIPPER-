'use strict';

function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function extractRef(text = '') {
  const m = String(text).match(/#([a-z0-9_-]{2,32})/i);
  return m ? m[1] : null;
}

function label(game) {
  const names = {
    quiz: 'Quiz',
    'truth-or-dare': 'Action/Vérité',
    'mystery-character': 'Personnage Mystère',
    hangman: 'Pendu'
  };
  return `${names[game.type] || game.type} #${game.alias}`;
}

function listText(gameMaster, chatId) {
  const games = gameMaster.list(chatId, { activeOnly: true });
  if (!games.length) return 'Aucune partie active ici pour le moment.';
  return ['🎮 *Parties actives*', ...games.map((g, i) => `${i + 1}. ${label(g)} — ${g.status}`), '', 'Quand plusieurs jeux du même type tournent, ajoute simplement le #ID à ta réponse.'].join('\n');
}

async function handleAdvancedGames(exaucee, { sock, msg, chatId, userId, text, send }) {
  const raw = String(text || '').trim();
  const lower = normalize(raw);
  const ref = extractRef(raw);
  const gm = exaucee.gameMaster;

  if (/\b(?:liste|montre|affiche|quelles?)\b.*\b(?:jeux|parties)\b|^(?:jeux|parties)\s+(?:actifs|actives)$/i.test(lower)) {
    await send(listText(gm, chatId));
    return true;
  }

  if (/\b(?:arrete|stop|termine|finis)\b.*\b(?:tous|toutes)\b.*\b(?:jeux|parties)\b/.test(lower)) {
    const stopped = gm.stopAll(chatId);
    if (!stopped.length) return false;
    await send(`J’ai arrêté ${stopped.length} partie${stopped.length > 1 ? 's' : ''} ici.`);
    return true;
  }

  if (ref && /\b(?:arrete|stop|termine|finis)\b/.test(lower)) {
    const stopped = gm.stop(chatId, ref);
    if (!stopped) { await send(`Je ne trouve pas de partie active #${ref}.`); return true; }
    await send(`${label(stopped)} est arrêtée.`);
    return true;
  }

  if (/\b(?:lance|demarre|commence|start)\b.*\b(?:personnage mystere|mystery character|devine le personnage)\b|^(?:personnage mystere|mystery character)$/i.test(lower)) {
    const started = gm.startMystery(chatId, { by: userId });
    await send(`🕵️ *Personnage Mystère #${started.game.alias}*\nIndice 1/3 : ${started.clue}\n\nRéponds avec ton idée. Si plusieurs parties tournent, ajoute #${started.game.alias}.`);
    return true;
  }

  if (/\b(?:lance|demarre|commence|start)\b.*\bpendu\b|^pendu$/i.test(lower)) {
    const started = gm.startHangman(chatId, { by: userId });
    await send(`🧩 *Pendu #${started.game.alias}*\n${started.display}\nErreurs : 0/${started.game.maxMisses}\n\nPropose une lettre ou le mot. Si plusieurs parties tournent, ajoute #${started.game.alias}.`);
    return true;
  }

  const mystery = gm.resolve(chatId, ref, 'mystery-character');
  if (mystery && (ref || gm.list(chatId, { activeOnly: true, type: 'mystery-character' }).length === 1)) {
    const cleaned = raw.replace(/#[a-z0-9_-]{2,32}/i, '').replace(/^\s*(?:je pense que c est|je dirais|reponse|answer)\s*[:=-]?\s*/i, '').trim();
    if (cleaned && !/^(?:indice|hint)$/i.test(cleaned)) {
      const result = gm.guessMystery(chatId, userId, cleaned, ref);
      if (result.handled) {
        if (result.correct) await send(`🎉 Trouvé ! C’était *${result.answer}*. +${result.points} point${result.points > 1 ? 's' : ''} sur ${label(result.game)}.`);
        else await send(`Pas encore 👀\nIndice ${Math.min(result.clueIndex + 1, 3)}/3 : ${result.clue}\nPartie #${result.game.alias}`);
        return true;
      }
    }
  }

  const hangman = gm.resolve(chatId, ref, 'hangman');
  if (hangman && (ref || gm.list(chatId, { activeOnly: true, type: 'hangman' }).length === 1)) {
    const cleaned = raw.replace(/#[a-z0-9_-]{2,32}/i, '').replace(/^\s*(?:lettre|mot|reponse)\s*[:=-]?\s*/i, '').trim();
    if (/^[a-zA-ZÀ-ÿ]$/.test(cleaned) || /^[a-zA-ZÀ-ÿ-]{2,40}$/.test(cleaned)) {
      const result = gm.playHangman(chatId, userId, cleaned, ref);
      if (result.handled) {
        if (result.won) await send(`🎉 Gagné ! Le mot était *${result.word.toUpperCase()}*.\n${label(result.game)}`);
        else if (result.lost) await send(`💀 Partie terminée. Le mot était *${result.word.toUpperCase()}*.\n${label(result.game)}`);
        else await send(`${result.correct ? '✅' : '❌'} ${result.display}\nErreurs : ${result.misses}/${result.maxMisses}\nPartie #${result.game.alias}`);
        return true;
      }
    }
  }

  // Ciblage explicite d'un quiz lorsqu'il y en a plusieurs dans le même chat.
  if (ref && gm.resolve(chatId, ref, 'quiz')) {
    const cleaned = raw.replace(/#[a-z0-9_-]{2,32}/i, '').trim();
    const result = gm.answerQuiz(chatId, userId, cleaned, ref);
    if (result.handled) {
      if (!result.correct) await send(`Pas exactement 👀 Essaie encore sur Quiz #${result.game.alias}.`);
      else if (result.finished) await send(`✅ Bonne réponse : *${result.correctAnswer}*\n🏁 Quiz #${result.game.alias} terminé.`);
      else await send(`✅ Bonne réponse : *${result.correctAnswer}*\n\nQuestion ${result.round}/${result.totalRounds} — Quiz #${result.game.alias}\n${result.nextQuestion}`);
      return true;
    }
  }

  // Ciblage explicite d'une partie Action/Vérité.
  if (ref && gm.resolve(chatId, ref, 'truth-or-dare') && /\b(action|dare|defi|verite|truth)\b/.test(lower)) {
    const choice = raw.replace(/#[a-z0-9_-]{2,32}/i, '').trim();
    const turn = gm.nextTruthOrDare(chatId, userId, choice, ref);
    if (turn.handled) {
      await send(`🎭 *${turn.type.toUpperCase()} — tour ${turn.turn}*\n${turn.prompt}\n\nPartie #${turn.game.alias}`);
      return true;
    }
  }

  return false;
}

module.exports = { handleAdvancedGames, extractRef, listText, label };
