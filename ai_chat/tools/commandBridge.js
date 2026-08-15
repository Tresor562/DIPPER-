'use strict';

const { assertPermission } = require('../security/policy');
const { checkAccess } = require('../../utils/accessControl');

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
      privateOnly: Boolean(cmd.privateOnly),
      adminOnly: Boolean(cmd.adminOnly),
      ownerOnly: Boolean(cmd.ownerOnly),
      sudoOnly: Boolean(cmd.sudoOnly),
      premiumOnly: Boolean(cmd.premiumOnly),
      vipOnly: Boolean(cmd.vipOnly),
      accessLevel: cmd.accessLevel || 'public',
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
    const chatId = context.msg?.key?.remoteJid || '';
    const sender = context.sender || context.msg?.key?.participant || chatId;
    const isGroup = chatId.endsWith('@g.us');

    if (cmd.groupOnly && !isGroup) {
      const err = new Error(`La commande ${cmd.name} nécessite un groupe`);
      err.code = 'EXAUCEE_GROUP_ONLY';
      throw err;
    }
    if (cmd.privateOnly && isGroup) {
      const err = new Error(`La commande ${cmd.name} nécessite une conversation privée`);
      err.code = 'EXAUCEE_PRIVATE_ONLY';
      throw err;
    }
    if (cmd.botAdminNeeded && context.botIsAdmin === false) {
      const err = new Error(`Le bot doit être administrateur pour ${cmd.name}`);
      err.code = 'EXAUCEE_BOT_ADMIN_REQUIRED';
      throw err;
    }
    if (cmd.adminOnly && !(actor.isAdmin || actor.isOwner || actor.isSuperMe)) {
      const err = new Error(`La commande ${cmd.name} est réservée aux administrateurs`);
      err.code = 'EXAUCEE_ADMIN_REQUIRED';
      throw err;
    }

    const central = checkAccess({
      sender,
      isMe: Boolean(actor.isOwner || actor.isSuperMe),
      isSuperMe: Boolean(actor.isSuperMe),
      isSudo: Boolean(actor.isSudo),
      command: cmd
    });
    if (!central.allowed) {
      const err = new Error(central.message || `Permission refusée pour ${cmd.name}`);
      err.code = `EXAUCEE_${String(central.reason || 'ACCESS').toUpperCase()}_REQUIRED`;
      throw err;
    }

    const allowedRoles = cmd.ownerOnly
      ? ['supreme', 'owner']
      : cmd.sudoOnly || cmd.accessLevel === 'sudo'
        ? ['supreme', 'owner', 'sudo']
        : cmd.adminOnly
          ? ['supreme', 'owner', 'admin']
          : ['supreme', 'owner', 'sudo', 'admin', 'user'];

    assertPermission({ actor, tool: { name: cmd.name, allowedRoles, destructive: Boolean(context.destructive) } });

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
