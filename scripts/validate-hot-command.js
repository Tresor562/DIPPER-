'use strict';

const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Fichier candidat manquant.');
  process.exit(2);
}

try {
  const resolved = path.resolve(file);
  try { delete require.cache[require.resolve(resolved)]; } catch (_) {}
  const exported = require(resolved);
  const list = Array.isArray(exported) ? exported : [exported];
  const commands = [];

  for (const command of list) {
    if (!command || typeof command !== 'object') continue;
    if (!command.name || typeof command.execute !== 'function') continue;
    const name = String(command.name).trim();
    if (!name) throw new Error('Nom de commande vide.');
    const aliases = Array.isArray(command.aliases)
      ? command.aliases.map(value => String(value).trim()).filter(Boolean)
      : [];
    commands.push({ name, aliases });
  }

  if (!commands.length) {
    throw new Error('Aucun export commande valide (name + execute).');
  }

  process.stdout.write(JSON.stringify({ ok: true, commands }));
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
