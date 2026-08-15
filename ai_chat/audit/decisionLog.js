'use strict';

const fs = require('fs');
const path = require('path');
const { redact } = require('../security/policy');

class DecisionLog {
  constructor({ root = path.join(process.cwd(), 'data', 'exaucee', 'audit') } = {}) { this.root = root; }
  write(event) {
    fs.mkdirSync(this.root, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const line = JSON.stringify(redact({ ts: Date.now(), ...event })) + '\n';
    fs.appendFileSync(path.join(this.root, `${day}.jsonl`), line);
  }
}

module.exports = { DecisionLog };
