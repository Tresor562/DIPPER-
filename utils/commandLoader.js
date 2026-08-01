const fs = require('fs');
const path = require('path');

let _commandsCache = null;

const loadCommands = (forceReload = false) => {
  // [PERF] Cache en mémoire : ne charger qu'une seule fois au démarrage
  // sauf si forceReload=true (appelé par .reload)
  if (_commandsCache && !forceReload) return _commandsCache;

  const commands     = new Map();
  const commandsPath = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(commandsPath)) return commands;

  const categories = fs.readdirSync(commandsPath);
  let   loaded = 0, errors = 0;

  categories.forEach(category => {
    const categoryPath = path.join(commandsPath, category);
    try {
      if (!fs.statSync(categoryPath).isDirectory()) return;
    } catch { return; }

    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));

    files.forEach(file => {
      const filePath = path.join(categoryPath, file);
      try {
        // Vider le cache require UNIQUEMENT si forceReload
        if (forceReload) delete require.cache[require.resolve(filePath)];

        const commandExport = require(filePath);

        // Support tableau ET objet unique
        const commandList = Array.isArray(commandExport)
          ? commandExport
          : [commandExport];

        commandList.forEach(command => {
          // Ne traiter que les vrais objets commande (name + execute)
          if (command && typeof command === 'object' && command.name && typeof command.execute === 'function') {
            // [FIX ROOT CAUSE] Un nom déjà pris était silencieusement écrasé, et un
            // alias déjà pris était silencieusement ignoré, sans aucun log. C'est ce
            // silence qui avait laissé passer la collision mediatag/tagmedia entre
            // mediatag.js et mentstats.js. On logge maintenant systématiquement
            // toute collision de nom OU d'alias pour qu'elle apparaisse au démarrage
            // au lieu de dépendre d'un audit manuel.
            if (commands.has(command.name)) {
              const previous = commands.get(command.name);
              console.warn(`[commandLoader] ⚠️ Collision de nom '${command.name}' : ${category}/${file} écrase une commande déjà enregistrée (description précédente: "${previous.description}"). Vérifier lequel des deux doit rester.`);
            }
            commands.set(command.name, command);
            if (Array.isArray(command.aliases)) {
              command.aliases.forEach(alias => {
                if (alias && commands.has(alias) && commands.get(alias) !== command) {
                  console.warn(`[commandLoader] ⚠️ Collision d'alias '${alias}' : ${category}/${file} (commande '${command.name}') ne peut pas le prendre, déjà utilisé par '${commands.get(alias).name}'.`);
                } else if (alias && !commands.has(alias)) {
                  commands.set(alias, command);
                }
              });
            }
            loaded++;
          }
        });

      } catch (error) {
        errors++;
        console.error(`[commandLoader] ❌ ${category}/${file}:`, error.message);
      }
    });
  });

  if (forceReload || !_commandsCache) {
    console.log(`[commandLoader] ✅ ${loaded} commandes chargées${errors ? ` (${errors} erreurs)` : ''}`);
  }

  _commandsCache  = commands;
  global.commands = commands;
  return commands;
};

module.exports = { loadCommands };

