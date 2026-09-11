const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'templates.json');
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'templates');

function useBlobs() {
  return !!(
    process.env.NETLIFY ||
    process.env.NETLIFY_DEV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

function getBlobStore(name) {
  const { getStore } = require('@netlify/blobs');
  const siteID =
    process.env.SITE_ID ||
    process.env.NETLIFY_SITE_ID ||
    process.env.BLOBS_SITE_ID;
  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.BLOBS_TOKEN;

  // After connectLambda(event), plain getStore(name) works.
  // Manual siteID/token is a fallback if env vars are set in Netlify UI.
  if (siteID && token) {
    return getStore({
      name,
      siteID,
      token,
      consistency: 'strong',
    });
  }

  return getStore({ name, consistency: 'strong' });
}

async function getTemplates() {
  if (useBlobs()) {
    try {
      const store = getBlobStore('templates-data');
      const data = await store.get('templates', { type: 'json' });
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('getTemplates blobs error:', err);
      return [];
    }
  }

  try {
    if (!fs.existsSync(DB_PATH)) return [];
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('getTemplates fs error:', err);
    return [];
  }
}

async function saveTemplates(templates) {
  if (useBlobs()) {
    const store = getBlobStore('templates-data');
    await store.setJSON('templates', templates);
    return;
  }

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(templates, null, 2));
}

function makeFilename(originalname, mime) {
  const mimeExt = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  let ext = path.extname(originalname || '');
  if (!ext && mime) ext = mimeExt[mime] || '.jpg';
  if (!ext) ext = '.jpg';
  const base = path
    .basename(originalname || 'image', ext)
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .toLowerCase() || 'image';
  return `${Date.now()}-${base}${ext.toLowerCase()}`;
}

async function saveImageBuffer(buffer, originalname, mime) {
  const filename = makeFilename(originalname, mime);
  const contentType = mime || 'image/jpeg';

  if (useBlobs()) {
    const store = getBlobStore('template-images');
    await store.set(filename, buffer, {
      metadata: { contentType: String(contentType) },
    });
  } else {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  }

  return `/templates/${filename}`;
}

async function saveImage(file) {
  if (!file) throw new Error('No file provided');
  const buffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
  if (!buffer) throw new Error('File buffer missing');
  return saveImageBuffer(buffer, file.originalname, file.mimetype);
}

async function saveImageFromBase64(dataUrl, originalname) {
  if (!dataUrl || typeof dataUrl !== 'string') return '';
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    // already a URL path
    if (dataUrl.startsWith('/templates/') || dataUrl.startsWith('http')) {
      return dataUrl;
    }
    throw new Error('Invalid image data');
  }
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  return saveImageBuffer(buffer, originalname || `upload${Date.now()}`, mime);
}

async function getImage(filename) {
  if (useBlobs()) {
    const store = getBlobStore('template-images');
    const blob = await store.getWithMetadata(filename, { type: 'arrayBuffer' });
    if (!blob || !blob.data) return null;
    return {
      buffer: Buffer.from(blob.data),
      contentType: (blob.metadata && blob.metadata.contentType) || 'image/jpeg',
    };
  }

  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return {
    buffer: fs.readFileSync(filePath),
    contentType: types[ext] || 'application/octet-stream',
  };
}

module.exports = {
  useBlobs,
  getTemplates,
  saveTemplates,
  saveImage,
  saveImageFromBase64,
  getImage,
};
