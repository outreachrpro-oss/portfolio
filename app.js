const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const slugify = require('slugify');
const bodyParser = require('body-parser');
const {
  getTemplates,
  saveTemplates,
  saveImage,
  saveImageFromBase64,
  getImage,
} = require('./lib/storage');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = process.cwd();

app.set('view engine', 'ejs');
app.set('views', path.join(ROOT_DIR, 'views'));

app.use((req, _res, next) => {
  const prefix = '/.netlify/functions/server';
  if (req.url.startsWith(prefix)) {
    req.url = req.url.slice(prefix.length) || '/';
  }
  next();
});

app.use(bodyParser.urlencoded({ extended: true, limit: '12mb' }));
app.use(bodyParser.json({ limit: '12mb' }));

const getFilterOptions = (templates) => {
  const set = new Set();
  templates.forEach((t) => {
    if (t.technology) set.add(t.technology);
    if (t.category) set.add(t.category);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function splitLines(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);
}

async function upsertTemplate(payload, files) {
  const templates = await getTemplates();
  const {
    id,
    title,
    technology,
    category,
    shortDescription,
    description,
    liveDemoUrl,
    purchaseUrl,
    price,
    features,
    pagesIncluded,
    technologiesUsed,
    status,
    thumbnailData,
    galleryData,
  } = payload;

  if (!title || !String(title).trim()) {
    throw new Error('Template name is required');
  }

  const published = status === 'published' || status === true || status === 'true';
  const slug = slugify(String(title), { lower: true, strict: true });

  let existing = null;
  if (id) existing = templates.find((t) => t.id === id);

  let thumbnail = existing ? existing.thumbnail : '';
  if (files && files.thumbnail && files.thumbnail[0]) {
    thumbnail = await saveImage(files.thumbnail[0]);
  } else if (thumbnailData) {
    thumbnail = await saveImageFromBase64(thumbnailData, `${slug}-thumb.jpg`);
  }

  let galleryImages = existing ? existing.galleryImages || [] : [];
  if (files && files.gallery && files.gallery.length) {
    const newImages = [];
    for (const file of files.gallery) {
      newImages.push(await saveImage(file));
    }
    galleryImages = [...galleryImages, ...newImages].slice(0, 5);
  } else if (Array.isArray(galleryData) && galleryData.length) {
    const newImages = [];
    for (let i = 0; i < Math.min(galleryData.length, 5); i++) {
      newImages.push(await saveImageFromBase64(galleryData[i], `${slug}-gallery-${i}.jpg`));
    }
    galleryImages = [...galleryImages, ...newImages].slice(0, 5);
  }

  const newTemplate = {
    id: id || crypto.randomUUID(),
    title: String(title).trim(),
    slug,
    technology: String(technology || '').trim(),
    category: String(category || '').trim(),
    shortDescription: shortDescription || '',
    description: description || '',
    thumbnail,
    galleryImages,
    liveDemoUrl: liveDemoUrl || '',
    purchaseUrl: purchaseUrl || '',
    price: price || '',
    features: splitLines(features),
    pagesIncluded: splitLines(pagesIncluded),
    technologiesUsed: splitLines(technologiesUsed),
    published,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (id && existing) {
    const index = templates.findIndex((t) => t.id === id);
    templates[index] = newTemplate;
  } else {
    templates.push(newTemplate);
  }

  await saveTemplates(templates);
  return newTemplate;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/portfolio.html', async (req, res) => {
  // Show all templates on portfolio
  const templates = await getTemplates();
  const filters = getFilterOptions(templates);
  res.render('portfolio', {
    title: 'Portfolio',
    bodyClass: 'portfolio-page',
    templates,
    filters,
  });
});

app.get('/api/templates', async (req, res) => {
  try {
    const templates = await getTemplates();
    res.json({ templates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

app.get('/projects-details.html', async (req, res) => {
  const slug = req.query.slug;

  if (!slug) {
    return res.sendFile(path.join(ROOT_DIR, 'projects-details.html'));
  }

  const templates = await getTemplates();
  const template = templates.find((t) => t.slug === slug);

  if (!template) {
    return res.status(404).send('Template not found');
  }

  res.render('projects-details', {
    title: template.title,
    template,
    bodyClass: 'template-details-page',
  });
});

app.get('/admin/templates', async (req, res) => {
  const templates = await getTemplates();
  res.render('admin/templates', {
    title: 'Manage Templates',
    templates,
    bodyClass: 'admin-page',
  });
});

app.get('/admin/templates/add', (req, res) => {
  res.render('admin/template-form', {
    title: 'Add Template',
    template: null,
    bodyClass: 'admin-page',
  });
});

// Multipart save (local / when multer works)
app.post(
  '/admin/templates/save',
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'gallery', maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      await upsertTemplate(req.body || {}, req.files || {});
      res.redirect('/admin/templates');
    } catch (err) {
      console.error('Save template error:', err);
      res.status(500).send(`Failed to save template: ${err.message}`);
    }
  }
);

// JSON + base64 save (reliable on Netlify)
app.post('/admin/templates/save-json', async (req, res) => {
  try {
    const template = await upsertTemplate(req.body || {}, {});
    res.json({ ok: true, template });
  } catch (err) {
    console.error('Save JSON template error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to save template' });
  }
});

app.get('/admin/templates/edit/:id', async (req, res) => {
  const templates = await getTemplates();
  const template = templates.find((t) => t.id === req.params.id);
  if (!template) return res.redirect('/admin/templates');
  res.render('admin/template-form', {
    title: 'Edit Template',
    template,
    bodyClass: 'admin-page',
  });
});

app.post('/admin/templates/delete/:id', async (req, res) => {
  try {
    let templates = await getTemplates();
    templates = templates.filter((t) => t.id !== req.params.id);
    await saveTemplates(templates);
    res.redirect('/admin/templates');
  } catch (err) {
    console.error(err);
    res.status(500).send(`Failed to delete: ${err.message}`);
  }
});

app.get('/templates/:filename', async (req, res) => {
  try {
    const image = await getImage(req.params.filename);
    if (!image) return res.status(404).send('Image not found');
    res.set('Content-Type', image.contentType);
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(image.buffer);
  } catch (err) {
    console.error('Image serve error:', err);
    res.status(404).send('Image not found');
  }
});

app.get('/:page.html', (req, res) => {
  const page = req.params.page;
  const htmlPath = path.join(ROOT_DIR, `${page}.html`);
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  res.status(404).send('Page not found');
});

app.use(express.static(ROOT_DIR));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = { app };
