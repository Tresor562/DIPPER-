'use strict';

const {
  getExauceeStatus,
  getProviderStatus,
  setExauceeSettings,
  resetExauceeSettings,
  restartExaucee
} = require('../../ai_chat/runtimeControl');

const yesNo = value => value ? '✅ ON' : '❌ OFF';

function renderStatus(settings) {
  return [
    '🌸 *EXAUCÉE — CONTRÔLE OWNER*',
    '',
    `État : ${yesNo(settings.enabled)}`,
    `Only tag : ${yesNo(settings.onlyTag)}`,
    `Owner only : ${yesNo(settings.ownerOnly)}`,
    `Groupes : ${yesNo(settings.groups)}`,
    `Privé : ${yesNo(settings.private)}`,
    '',
    '*.exaucee on* — activer',
    '*.exaucee off* — désactiver',
    '*.exaucee status* — état actuel',
    '*.exaucee providers* — cerveaux IA réellement configurés',
    '*.exaucee restart* — relancer le runtime',
    '*.exaucee onlytag* — basculer le mode mention obligatoire en groupe',
    '*.exaucee owneronly* — basculer le mode réservé aux owners',
    '*.exaucee group on|off* — autoriser/interdire les groupes',
    '*.exaucee private on|off* — autoriser/interdire les privés',
    '*.exaucee auto* — mode conversationnel normal',
    '*.exaucee reset* — réglages par défaut'
  ].join('\n');
}

function renderProviders(status = {}) {
  const p = status.providers || {};
  const rows = Object.entries(p).map(([name, cfg]) => {
    const state = cfg.configured ? (cfg.healthy === false ? '🟠 cooldown' : '🟢 prêt') : '⚪ non configuré';
    return `• ${name} — ${state}${cfg.model ? ` — ${cfg.model}` : ''}`;
  });
  return [
    '🧠 *EXAUCÉE — CERVEAUX IA*',
    '',
    ...rows,
    '',
    'Modes : FAST / NORMAL / DEEP / AGENT / DUAL / CRITICAL',
    'Politique : aucun fallback payant automatique.',
    '',
    'ℹ️ Groq, Gemini et OpenRouter nécessitent leurs clés dans les variables Render. Les clés ne sont jamais affichées ici.'
  ].join('\n');
}

function parseSwitch(value) {
  const v = String(value || '').toLowerCase();
  if (['on', 'true', '1', 'yes', 'oui'].includes(v)) return true;
  if (['off', 'false', '0', 'no', 'non'].includes(v)) return false;
  return null;
}

module.exports = {
  name: 'exaucee',
  aliases: ['exa', 'exauceectl'],
  category: '👑 Owner',
  description: 'Contrôle le runtime Exaucée depuis WhatsApp',
  usage: '.exaucee <on|off|status|providers|restart|onlytag|owneronly|group|private|auto|reset>',

  async execute(sock, msg, args, extra) {
    const allowed = Boolean(extra?.isOwner || extra?.isSuperMe || extra?.isMe || msg?.key?.fromMe);
    if (!allowed) return extra?.reply?.('❌ Commande réservée au propriétaire.');

    const action = String(args?.[0] || 'status').toLowerCase();
    let settings;

    if (action === 'on') {
      settings = setExauceeSettings({ enabled: true });
      restartExaucee(sock);
      return extra.reply(`🌸 Exaucée est maintenant *activée*.\n\n${renderStatus(settings)}`);
    }

    if (action === 'off') {
      settings = setExauceeSettings({ enabled: false });
      return extra.reply(`🌸 Exaucée est maintenant *désactivée*.\n\n${renderStatus(settings)}`);
    }

    if (action === 'providers' || action === 'brains' || action === 'ai') {
      return extra.reply(renderProviders(getProviderStatus()));
    }

    if (action === 'restart') {
      settings = restartExaucee(sock);
      return extra.reply(`♻️ Runtime Exaucée relancé.\n\n${renderStatus(settings)}`);
    }

    if (action === 'onlytag') {
      const current = getExauceeStatus();
      const explicit = parseSwitch(args?.[1]);
      settings = setExauceeSettings({ onlyTag: explicit === null ? !current.onlyTag : explicit });
      return extra.reply(renderStatus(settings));
    }

    if (action === 'owneronly') {
      const current = getExauceeStatus();
      const explicit = parseSwitch(args?.[1]);
      settings = setExauceeSettings({ ownerOnly: explicit === null ? !current.ownerOnly : explicit });
      return extra.reply(renderStatus(settings));
    }

    if (action === 'group' || action === 'groups') {
      const value = parseSwitch(args?.[1]);
      if (value === null) return extra.reply('Usage : *.exaucee group on* ou *.exaucee group off*');
      settings = setExauceeSettings({ groups: value });
      return extra.reply(renderStatus(settings));
    }

    if (action === 'private' || action === 'pv') {
      const value = parseSwitch(args?.[1]);
      if (value === null) return extra.reply('Usage : *.exaucee private on* ou *.exaucee private off*');
      settings = setExauceeSettings({ private: value });
      return extra.reply(renderStatus(settings));
    }

    if (action === 'auto') {
      settings = setExauceeSettings({ enabled: true, onlyTag: false, ownerOnly: false, groups: true, private: true });
      restartExaucee(sock);
      return extra.reply(`🌸 Mode conversationnel normal restauré.\n\n${renderStatus(settings)}`);
    }

    if (action === 'reset') {
      settings = resetExauceeSettings();
      restartExaucee(sock);
      return extra.reply(`🌸 Réglages Exaucée réinitialisés.\n\n${renderStatus(settings)}`);
    }

    return extra.reply(renderStatus(getExauceeStatus()));
  }
};
