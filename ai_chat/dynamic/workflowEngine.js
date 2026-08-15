'use strict';

function render(template, ctx = {}) {
  const args = Array.isArray(ctx.args) ? ctx.args : [];
  const values = {
    user: ctx.userName || ctx.userId || 'utilisateur',
    userId: ctx.userId || '',
    chatId: ctx.chatId || '',
    args: args.join(' '),
    arg1: args[0] || '',
    arg2: args[1] || '',
    arg3: args[2] || ''
  };
  return String(template || '').replace(/\{(user|userId|chatId|args|arg1|arg2|arg3)\}/g, (_, key) => String(values[key] ?? ''));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function executeWorkflow(workflow, ctx = {}) {
  if (!workflow || typeof workflow !== 'object') return { handled: false };
  const send = ctx.send;
  if (typeof send !== 'function') return { handled: false };

  if (workflow.type === 'reply') {
    await send(render(workflow.text, ctx));
    return { handled: true, steps: 1 };
  }

  if (workflow.type === 'random_reply') {
    const choices = (workflow.choices || []).filter(x => typeof x === 'string' && x.trim()).slice(0, 30);
    if (!choices.length) return { handled: false };
    const picked = choices[Math.floor(Math.random() * choices.length)];
    await send(render(picked, ctx));
    return { handled: true, steps: 1 };
  }

  if (workflow.type === 'sequence') {
    const steps = Array.isArray(workflow.steps) ? workflow.steps.slice(0, 12) : [];
    let done = 0;
    for (const step of steps) {
      if (!step || typeof step !== 'object') continue;
      if (step.type === 'reply') {
        await send(render(step.text, ctx));
        done += 1;
      } else if (step.type === 'random_reply') {
        const choices = (step.choices || []).filter(x => typeof x === 'string' && x.trim()).slice(0, 20);
        if (choices.length) {
          await send(render(choices[Math.floor(Math.random() * choices.length)], ctx));
          done += 1;
        }
      } else if (step.type === 'wait') {
        const ms = Math.max(0, Math.min(Number(step.ms) || 0, 10000));
        if (ms) await sleep(ms);
      }
    }
    return { handled: done > 0, steps: done };
  }

  return { handled: false };
}

function parseWorkflowIntent(text = '') {
  const value = String(text).trim();
  let m = value.match(/cr[ée]e?\s+(?:une\s+)?commande\s+([a-z0-9_-]{2,30})\s+qui\s+r[ée]pond\s+al[ée]atoirement\s+(.+)/i);
  if (m) {
    const choices = m[2].split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean).slice(0, 20);
    if (choices.length >= 2) return { name: m[1].toLowerCase(), workflow: { type: 'random_reply', choices } };
  }

  m = value.match(/cr[ée]e?\s+(?:une\s+)?commande\s+([a-z0-9_-]{2,30})\s+qui\s+envoie\s+(.+)/i);
  if (m && /\s*\|\s*/.test(m[2])) {
    const parts = m[2].split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean).slice(0, 10);
    if (parts.length >= 2) return { name: m[1].toLowerCase(), workflow: { type: 'sequence', steps: parts.map(text => ({ type: 'reply', text })) } };
  }

  return null;
}

module.exports = { executeWorkflow, parseWorkflowIntent, render };
