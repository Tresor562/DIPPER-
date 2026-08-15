'use strict';

const fs = require('fs');
const { spawn } = require('child_process');

class LocalModelRunner {
  constructor(env = process.env) {
    this.binary = env.EXAUCEE_LLAMA_CLI || '';
    this.model = env.EXAUCEE_GGUF_MODEL || '';
    this.ctx = Number(env.EXAUCEE_LOCAL_CTX || 4096);
    this.timeoutMs = Number(env.EXAUCEE_LOCAL_TIMEOUT || 45000);
  }

  available() {
    return Boolean(this.binary && this.model && fs.existsSync(this.binary) && fs.existsSync(this.model));
  }

  flatten(messages = []) {
    return messages.map(m => {
      const label = m.role === 'system' ? 'SYSTEM' : m.role === 'assistant' ? 'ASSISTANT' : 'USER';
      return `${label}: ${String(m.content || '')}`;
    }).join('\n\n') + '\n\nASSISTANT:';
  }

  complete(messages = []) {
    if (!this.available()) {
      const err = new Error('local-gguf unavailable');
      err.code = 'LOCAL_MODEL_UNAVAILABLE';
      return Promise.reject(err);
    }

    const args = ['-m', this.model, '-c', String(this.ctx), '-n', '700', '--temp', '0.7', '-p', this.flatten(messages)];
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let errText = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        const err = new Error('local-gguf timeout');
        err.code = 'LOCAL_MODEL_TIMEOUT';
        reject(err);
      }, this.timeoutMs);

      child.stdout.on('data', d => { out += d.toString(); if (out.length > 30000) out = out.slice(-30000); });
      child.stderr.on('data', d => { errText += d.toString(); if (errText.length > 8000) errText = errText.slice(-8000); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`local-gguf exit ${code}: ${errText.slice(-500)}`));
        let text = out.trim();
        const marker = text.lastIndexOf('ASSISTANT:');
        if (marker >= 0) text = text.slice(marker + 10).trim();
        if (!text) return reject(new Error('local-gguf empty response'));
        resolve({ provider: 'exaucee-local-gguf', text });
      });
    });
  }
}

module.exports = { LocalModelRunner };
