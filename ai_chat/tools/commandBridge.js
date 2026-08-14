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
      ownerOnly: Boolean(cmd.ownerOnly)
    };
  }

  async execute(name, context = {}, args = []) {
    const cmd = this.commands.get(String(name || '').toLowerCase());
    if (!cmd || typeof cmd.execute !== 'function') {
      const err = new Error(`Commande inconnue: ${name}`);
      err.code = 'EXAUCEE_COMMAND_NOT_FOUND';
      throw err;
    }

    const allowedRoles = cmd.ownerOnly
      ? ['supreme', 'owner']
      : cmd.adminOnly
        ? ['supreme', 'owner', 'admin']
        : ['supreme', 'owner', 'sudo', 'admin', 'user'];

    assertPermission({ actor: context.actor || {}, tool: { name: cmd.name, allowedRoles, destructive: Boolean(context.destructive) } });
    return cmd.execute(context.sock, context.msg, args, context.extra || {});
  }
}

module.exports = { CommandBridge };
