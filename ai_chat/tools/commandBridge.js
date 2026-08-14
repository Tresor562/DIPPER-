'use strict';

const { assertPermission } = require('../security/policy');

class CommandBridge {
  constructor({ commands }) {
    this.commands = commands || global.commands || new Map();
  }

  describe(name) {
    const cmd = this.commands.get(String(name || '').toLowerCase());
    if (!cmd) return null;
    return {
      name: cmd.name,
      aliases: cmd.aliases || [],
      description: cmd.description || '',
      category: cmd.category || '',
      groupOnly: Boolean(cmd.groupOnly),
      adminOnly: Boolean(cmd.adminOnly),
      ownerOnly: Boolean(cmd.ownerOnly),
      botAdminNeeded: Boolean(cmd.botAdminNeeded)
    };
  }

  async execute(name, context = {}, args = []) {
    const cmd = this.commands.get(String(name || '').toLowerCase());
    if (!cmd || typeof cmd.execute !== 'function') {
      const err = new Error(`Commande inconnue: ${name}`);
      err.code = 'EXAUCEE_COMMAND_NOT_FOUND';
      throw err;
    }

    const actor = context.actor || {};
    const isGroup = Boolean(context.msg?.key?.remoteJid?.endsWith('@g.us'));
    if (cmd.groupOnly && !isGroup) {
      const err = new Error(`La commande ${cmd.name} nécessite un groupe`);
      err.code = 'EXAUCEE_GROUP_ONLY';
      throw err;
    }
    if (cmd.botAdminNeeded && context.botIsAdmin === false) {
      const err = new Error(`Le bot doit être administrateur pour ${cmd.name}`);
      err.code = 'EXAUCEE_BOT_ADMIN_REQUIRED';
      throw err;
    }

    const allowedRoles = cmd.ownerOnly
      ? ['supreme', 'owner']
      : cmd.adminOnly
        ? ['supreme', 'owner', 'admin']
        : ['supreme', 'owner', 'sudo', 'admin', 'user'];

    assertPermission({ actor, tool: { name: cmd.name, allowedRoles, destructive: Boolean(context.destructive) } });

    // Les commandes existantes restent l'autorité finale. Exaucée enrichit `extra`
    // avec les mêmes drapeaux que le handler afin de ne jamais contourner leurs
    // vérifications internes (certaines commandes font leurs propres contrôles).
    const extra = {
      ...(context.extra || {}),
      isOwner: Boolean(actor.isOwner || actor.isSuperMe),
      isSuperMe: Boolean(actor.isSuperMe),
      isSudo: Boolean(actor.isSudo),
      isAdmin: Boolean(actor.isAdmin || actor.isOwner || actor.isSuperMe)
    };

    return cmd.execute(context.sock, context.msg, args, extra);
  }
}

module.exports = { CommandBridge };
