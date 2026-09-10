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
  return getStore(name);
}

async function getTemplates() {
  if (useBlobs()) {
    try {
      const store = getBlobStore('templates-data');
      const data = await store.get('templates', { type: 'json' });
      return Array.isArray(data) ? data : [];
    } catch (err) {
      return [];
    }
  }

  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

async function saveTemplates(templates) {
  if (useBlobs()) {
    const store = getBlobStore('templates-data');
    await store.setJSON('templates', templates);
    return;
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(templates, null, 2));
}

function makeFilename(originalname) {
  const ext = path.extname(originalname || '.jpg');
  const base = path
    .basename(originalname || 'image', ext)
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .toLowerCase();
  return `${Date.now()}-${base}${ext.toLowerCase()}`;
}

async function saveImage(file) {
  const filename = makeFilename(file.originalname);
  const contentType = file.mimetype || 'application/octet-stream';

  if (useBlobs()) {
    const store = getBlobStore('template-images');
    const buffer = file.buffer;
    await store.set(filename, buffer, {
      metadata: { contentType },
    });
  } else {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
  }

  return `/templates/${filename}`;
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
  getImage,
};
