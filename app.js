const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const slugify = require('slugify');
const bodyParser = require('body-parser');
const {
  getTemplates,
  saveTemplates,
  saveImage,
  getImage,
} = require('./lib/storage');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = process.cwd();

app.set('view engine', 'ejs');
app.set('views', path.join(ROOT_DIR, 'views'));

// Netlify function path cleanup
app.use((req, _res, next) => {
  const prefix = '/.netlify/functions/server';
  if (req.url.startsWith(prefix)) {
    req.url = req.url.slice(prefix.length) || '/';
  }
  next();
});

app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));

const getFilterOptions = (templates) => {
  const set = new Set();
  templates.forEach((t) => {
    if (t.technology) set.add(t.technology);
    if (t.category) set.add(t.category);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

// Memory storage works on Netlify Functions (no local disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/portfolio.html', async (req, res) => {
  const templates = (await getTemplates()).filter((t) => t.published);
  const filters = getFilterOptions(templates);
  res.render('portfolio', {
    title: 'Portfolio',
    bodyClass: 'portfolio-page',
    templates,
    filters,
  });
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

app.post(
  '/admin/templates/save',
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'gallery', maxCount: 5 },
  ]),
  async (req, res) => {
    try {
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
      } = req.body;

      const published = status === 'published';
      const slug = slugify(title || 'template', { lower: true, strict: true });

      let existing = null;
      if (id) {
        existing = templates.find((t) => t.id === id);
      }

      let thumbnail = existing ? existing.thumbnail : '';
      if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
        thumbnail = await saveImage(req.files.thumbnail[0]);
      }

      let galleryImages = existing ? existing.galleryImages || [] : [];
      if (req.files && req.files.gallery && req.files.gallery.length) {
        const newImages = [];
        for (const file of req.files.gallery) {
          newImages.push(await saveImage(file));
        }
        galleryImages = [...galleryImages, ...newImages].slice(0, 5);
      }

      const newTemplate = {
        id: id || uuidv4(),
        title,
        slug,
        technology: (technology || '').trim(),
        category: (category || '').trim(),
        shortDescription,
        description,
        thumbnail,
        galleryImages,
        liveDemoUrl,
        purchaseUrl,
        price,
        features: features
          ? features.split('\n').map((f) => f.trim()).filter(Boolean)
          : [],
        pagesIncluded: pagesIncluded
          ? pagesIncluded.split('\n').map((p) => p.trim()).filter(Boolean)
          : [],
        technologiesUsed: technologiesUsed
          ? technologiesUsed.split('\n').map((t) => t.trim()).filter(Boolean)
          : [],
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
      res.redirect('/admin/templates');
    } catch (err) {
      console.error('Save template error:', err);
      res.status(500).send('Failed to save template. Please try again.');
    }
  }
);

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
  let templates = await getTemplates();
  templates = templates.filter((t) => t.id !== req.params.id);
  await saveTemplates(templates);
  res.redirect('/admin/templates');
});

// Serve uploaded template images (local disk or Netlify Blobs)
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
