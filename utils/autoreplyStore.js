'use strict';

const { GridFSBucket, ObjectId } = require('mongodb');
const { getDb } = require('./mongoClient');

const BUCKET = 'autoreply_media';
const CONFIGS = 'autoreply_configs';
const MAX_MEDIA_BYTES = Number(process.env.AUTOREPLY_MAX_BYTES || 32 * 1024 * 1024);

function normalizeSessionId(value) {
  return String(value || 'default').trim() || 'default';
}

async function deleteOld(bucket, query) {
  const files = await bucket.find(query).toArray();
  for (const file of files) {
    try { await bucket.delete(file._id); } catch (_) {}
  }
}

async function save(sessionId, buffer, meta = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1000) throw new Error('Média autoreply invalide.');
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error(`Note vidéo trop volumineuse (${Math.ceil(MAX_MEDIA_BYTES / 1024 / 1024)} Mo max).`);

  const sid = normalizeSessionId(sessionId);
  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: BUCKET });
  const filename = `autoreply-${sid}`;

  await deleteOld(bucket, { 'metadata.sessionId': sid });

  const upload = bucket.openUploadStream(filename, {
    metadata: {
      sessionId: sid,
      mediaType: meta.mediaType || 'videoMessage',
      mimetype: meta.mimetype || 'video/mp4',
      isPtv: meta.isPtv !== false,
      setAt: meta.setAt || Date.now(),
      setBy: meta.setBy || '',
    },
  });

  await new Promise((resolve, reject) => {
    upload.once('error', reject);
    upload.once('finish', resolve);
    upload.end(buffer);
  });

  const config = {
    sessionId: sid,
    active: meta.active !== false,
    delay: Number(meta.delay || 0),
    isPtv: meta.isPtv !== false,
    mediaType: meta.mediaType || 'videoMessage',
    mimetype: meta.mimetype || 'video/mp4',
    setBy: meta.setBy || '',
    setAt: meta.setAt || Date.now(),
    fileId: upload.id,
    bytes: buffer.length,
    updatedAt: new Date(),
  };

  await db.collection(CONFIGS).updateOne(
    { sessionId: sid },
    { $set: config },
    { upsert: true }
  );
  return config;
}

async function loadConfig(sessionId) {
  const sid = normalizeSessionId(sessionId);
  const db = await getDb();
  return db.collection(CONFIGS).findOne({ sessionId: sid });
}

async function load(sessionId) {
  const sid = normalizeSessionId(sessionId);
  const db = await getDb();
  const config = await db.collection(CONFIGS).findOne({ sessionId: sid, active: { $ne: false } });
  if (!config) return null;

  const bucket = new GridFSBucket(db, { bucketName: BUCKET });
  let fileId = config.fileId;
  if (fileId && !(fileId instanceof ObjectId)) {
    try { fileId = new ObjectId(String(fileId)); } catch (_) { fileId = null; }
  }
  if (!fileId) {
    const file = await bucket.find({ 'metadata.sessionId': sid }).sort({ uploadDate: -1 }).limit(1).next();
    fileId = file?._id || null;
  }
  if (!fileId) return null;

  const chunks = [];
  let total = 0;
  await new Promise((resolve, reject) => {
    const stream = bucket.openDownloadStream(fileId);
    stream.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_MEDIA_BYTES) {
        stream.destroy(new Error('Média autoreply persistant trop volumineux.'));
        return;
      }
      chunks.push(chunk);
    });
    stream.once('error', reject);
    stream.once('end', resolve);
  });

  const buffer = Buffer.concat(chunks);
  if (buffer.length < 1000) return null;
  return { ...config, buffer };
}

async function setActive(sessionId, active) {
  const sid = normalizeSessionId(sessionId);
  const db = await getDb();
  await db.collection(CONFIGS).updateOne({ sessionId: sid }, { $set: { active: !!active, updatedAt: new Date() } });
}

async function remove(sessionId) {
  const sid = normalizeSessionId(sessionId);
  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: BUCKET });
  await deleteOld(bucket, { 'metadata.sessionId': sid });
  await db.collection(CONFIGS).deleteOne({ sessionId: sid });
}

module.exports = { save, load, loadConfig, setActive, remove, normalizeSessionId, MAX_MEDIA_BYTES };
