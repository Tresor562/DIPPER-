'use strict';

const ACTION_PREFIX = 'nexui:';

function unwrapMessage(message) {
  let m = message || null;
  if (!m) return null;
  if (m.message && typeof m.message === 'object' && !m.conversation && !m.extendedTextMessage) m = m.message;
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
  return m;
}

function parseParamsJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch (_) { return null; }
}

function extractInteractiveId(message) {
  const m = unwrapMessage(message);
  if (!m) return null;

  const native =
    m.interactiveResponseMessage?.nativeFlowResponseMessage ||
    m.nativeFlowResponseMessage ||
    null;

  const params = parseParamsJson(native?.paramsJson);
  const id = params?.id || params?.selected_id || params?.selectedId || params?.button_id || params?.buttonId || params?.row_id || params?.rowId;
  if (id) return String(id).trim();

  const legacy =
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    null;
  return legacy ? String(legacy).trim() : null;
}

function decodeActionId(id, prefix = '.') {
  const raw = String(id || '').trim();
  if (!raw) return null;

  if (raw.startsWith('cmd:')) {
    const cmd = raw.slice(4).trim();
    return cmd ? `${prefix}${cmd}` : null;
  }
  if (!raw.startsWith(ACTION_PREFIX)) return null;

  const parts = raw.split(':').map(v => v.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const area = parts[1].toLowerCase();

  if (area === 'snake') {
    const action = (parts[2] || 'show').toLowerCase();
    const allowed = new Set(['up','down','left','right','new','show','chill','normal','fire']);
    if (!allowed.has(action)) return null;
    if (['chill','normal','fire'].includes(action)) return `${prefix}snake speed ${action}`;
    return `${prefix}snake ${action}`;
  }

  if (area === 'domino') {
    const action = (parts[2] || 'show').toLowerCase();
    if (action === 'play') {
      const tile = String(parts[3] || '').replace(/[^0-6-]/g, '');
      if (!/^\d-\d$/.test(tile)) return null;
      return `${prefix}domino play ${tile}`;
    }
    if (['new','show','pass'].includes(action)) return `${prefix}domino ${action}`;
    return null;
  }

  if (area === 'tiktok') {
    const action = (parts[2] || '').toLowerCase();
    const token = String(parts[3] || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!['video','audio'].includes(action) || !token) return null;
    return `${prefix}tiktok action ${action} ${token}`;
  }

  if (area === 'dashboard') {
    const action = (parts[2] || '').toLowerCase();
    if (action === 'snake') return `${prefix}snake new`;
    if (action === 'domino') return `${prefix}domino new`;
    if (action === 'menu') return `${prefix}menu`;
    if (action === 'tiktok') return `${prefix}tiktok`;
    return null;
  }

  return null;
}

function getInteractiveCommand(message, prefix = '.') {
  const id = extractInteractiveId(message);
  return decodeActionId(id, prefix);
}

module.exports = {
  ACTION_PREFIX,
  unwrapMessage,
  parseParamsJson,
  extractInteractiveId,
  decodeActionId,
  getInteractiveCommand,
};
