'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hot = require('../utils/hotCommandUpdater');
const publisher = require('../scripts/publish-hot-commands');

function tempCommands() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dipper-hot-'));
  const commandsRoot = path.join(root, 'commands');
  fs.mkdirSync(path.join(commandsRoot, 'general_tools'), { recursive: true });
  return { root, commandsRoot };
}

function commandSource(label, aliases = []) {
  return `'use strict';\nmodule.exports={name:'sample',aliases:${JSON.stringify(aliases)},async execute(){return ${JSON.stringify(label)};}};\n`;
}

function loadCommand(file) {
  delete require.cache[require.resolve(file)];
  return require(file);
}

class FakeCursor {
  constructor(rows) { this.rows = rows; }
  sort() { return this; }
  async toArray() { return this.rows.map(row => ({ ...row })); }
}

class FakeDb {
  constructor({ failBulk = false } = {}) {
    this.failBulk = failBulk;
    this.active = new Map();
    this.history = [];
  }
  collection(name) {
    if (name === hot.ACTIVE_COLLECTION) {
      return {
        bulkWrite: async ops => {
          if (this.failBulk) throw new Error('mongo down');
          for (const op of ops) {
            const id = op.updateOne.filter._id;
            this.active.set(id, { _id: id, ...op.updateOne.update.$set });
          }
          return { ok: 1 };
        },
        find: () => new FakeCursor([...this.active.values()]),
      };
    }
    if (name === hot.HISTORY_COLLECTION) {
      return {
        insertMany: async docs => {
          if (this.failBulk) throw new Error('mongo down');
          this.history.push(...docs.map(doc => ({ ...doc })));
          return { acknowledged: true };
        },
      };
    }
    throw new Error(`collection inconnue ${name}`);
  }
}

test('HOT remplace une commande atomiquement sans remplacer la Map du handler', async () => {
  const { root, commandsRoot } = tempCommands();
  try {
    const file = path.join(commandsRoot, 'general_tools', 'sample.js');
    fs.writeFileSync(file, commandSource('old', ['s']));
    const old = loadCommand(file);
    const map = new Map([['sample', old], ['s', old]]);
    const sameReference = map;
    const db = new FakeDb();

    const result = await hot.applyBatch([{
      action: 'upsert',
      path: 'commands/general_tools/sample.js',
      source: commandSource('new', ['s', 'fresh']),
    }], { db, commandsRoot, commandMap: map, commitSha: 'abc123' });

    assert.equal(map, sameReference);
    assert.equal(await map.get('sample').execute(), 'new');
    assert.equal(map.get('fresh'), map.get('sample'));
    assert.equal(result.success, true);
    assert.equal(db.active.get('commands/general_tools/sample.js').commitSha, 'abc123');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('une syntaxe cassée est rejetée avant de toucher à la commande active', async () => {
  const { root, commandsRoot } = tempCommands();
  try {
    const file = path.join(commandsRoot, 'general_tools', 'sample.js');
    const oldSource = commandSource('old', ['s']);
    fs.writeFileSync(file, oldSource);
    const old = loadCommand(file);
    const map = new Map([['sample', old], ['s', old]]);

    await assert.rejects(
      hot.applyBatch([{
        action: 'upsert',
        path: 'commands/general_tools/sample.js',
        source: "module.exports={name:'sample',execute(){",
      }], { db: new FakeDb(), commandsRoot, commandMap: map }),
      error => error.code === 'HOT_SYNTAX_INVALID'
    );

    assert.equal(fs.readFileSync(file, 'utf8'), oldSource);
    assert.equal(await map.get('sample').execute(), 'old');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('une collision avec une autre commande est refusée sans modification disque', async () => {
  const { root, commandsRoot } = tempCommands();
  try {
    const file = path.join(commandsRoot, 'general_tools', 'sample.js');
    const oldSource = commandSource('old');
    fs.writeFileSync(file, oldSource);
    const old = loadCommand(file);
    const other = { name: 'other', async execute() { return 'other'; } };
    const map = new Map([['sample', old], ['other', other]]);

    await assert.rejects(
      hot.applyBatch([{
        action: 'upsert',
        path: 'commands/general_tools/sample.js',
        source: commandSource('new', ['other']),
      }], { db: new FakeDb(), commandsRoot, commandMap: map }),
      error => error.code === 'HOT_COMMAND_COLLISION'
    );

    assert.equal(fs.readFileSync(file, 'utf8'), oldSource);
    assert.equal(map.get('other'), other);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('si Mongo échoue après chargement, disque et Map reviennent à la version précédente', async () => {
  const { root, commandsRoot } = tempCommands();
  try {
    const file = path.join(commandsRoot, 'general_tools', 'sample.js');
    const oldSource = commandSource('old', ['s']);
    fs.writeFileSync(file, oldSource);
    const old = loadCommand(file);
    const map = new Map([['sample', old], ['s', old]]);

    await assert.rejects(
      hot.applyBatch([{
        action: 'upsert',
        path: 'commands/general_tools/sample.js',
        source: commandSource('new', ['fresh']),
      }], { db: new FakeDb({ failBulk: true }), commandsRoot, commandMap: map }),
      error => error.code === 'HOT_PERSIST_FAILED'
    );

    assert.equal(fs.readFileSync(file, 'utf8'), oldSource);
    assert.equal(await map.get('sample').execute(), 'old');
    assert.equal(map.has('fresh'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('une commande HOT persistée est restaurée depuis Mongo au prochain démarrage', async () => {
  const { root, commandsRoot } = tempCommands();
  try {
    const file = path.join(commandsRoot, 'general_tools', 'sample.js');
    fs.writeFileSync(file, commandSource('base'));
    const base = loadCommand(file);
    const map = new Map([['sample', base]]);
    const db = new FakeDb();
    db.active.set('commands/general_tools/sample.js', {
      _id: 'commands/general_tools/sample.js',
      path: 'commands/general_tools/sample.js',
      deleted: false,
      source: commandSource('persisted', ['hot']),
    });

    const restored = await hot.hydrateActiveCommands({ db, commandsRoot, commandMap: map });
    assert.equal(restored.success, true);
    assert.equal(restored.restored, 1);
    assert.equal(await map.get('sample').execute(), 'persisted');
    assert.equal(map.get('hot'), map.get('sample'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('la suppression HOT retire les clés et persiste un tombstone', async () => {
  const { root, commandsRoot } = tempCommands();
  try {
    const file = path.join(commandsRoot, 'general_tools', 'sample.js');
    fs.writeFileSync(file, commandSource('old', ['s']));
    const old = loadCommand(file);
    const map = new Map([['sample', old], ['s', old]]);
    const db = new FakeDb();

    await hot.applyBatch([{
      action: 'delete',
      path: 'commands/general_tools/sample.js',
    }], { db, commandsRoot, commandMap: map });

    assert.equal(fs.existsSync(file), false);
    assert.equal(map.has('sample'), false);
    assert.equal(map.has('s'), false);
    assert.equal(db.active.get('commands/general_tools/sample.js').deleted, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('le publisher classe un commit touchant utils/ comme CORE et ne publie pas partiellement', () => {
  const classified = publisher.classifyChanges([
    { status: 'M', path: 'commands/general_tools/ping.js' },
    { status: 'M', path: 'utils/sessionManager.js' },
  ]);
  assert.deepEqual(classified.runtimeNonHot, ['utils/sessionManager.js']);
  assert.equal(classified.updates.length, 1);
});

test('docs/tests peuvent accompagner une commande HOT sans transformer le commit en CORE', () => {
  const classified = publisher.classifyChanges([
    { status: 'M', path: 'commands/general_tools/ping.js' },
    { status: 'M', path: 'tests/ping.test.js' },
    { status: 'M', path: 'docs/PING.md' },
  ]);
  assert.deepEqual(classified.runtimeNonHot, []);
  assert.deepEqual(classified.updates, [{ action: 'upsert', path: 'commands/general_tools/ping.js' }]);
});
