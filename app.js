const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const slugify = require('slugify');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const DB_PATH = path.join(__dirname, 'data', 'templates.json');

const getTemplates = () => {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
};

const saveTemplates = (templates) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(templates, null, 2));
};

const getFilterOptions = (templates) => {
  const set = new Set();
  templates.forEach((t) => {
    if (t.technology) set.add(t.technology);
    if (t.category) set.add(t.category);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads', 'templates');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .toLowerCase();
    cb(null, `${Date.now()}-${base}${ext.toLowerCase()}`);
  },
});

const upload = multer({ storage });

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/portfolio.html', (req, res) => {
  const templates = getTemplates().filter((t) => t.published);
  const filters = getFilterOptions(templates);
  res.render('portfolio', {
    title: 'Portfolio',
    bodyClass: 'portfolio-page',
    templates,
    filters,
  });
});

app.get('/projects-details.html', (req, res) => {
  const slug = req.query.slug;

  // Original static details page when no template slug
  if (!slug) {
    return res.sendFile(path.join(__dirname, 'projects-details.html'));
  }

  const templates = getTemplates();
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

app.get('/admin/templates', (req, res) => {
  const templates = getTemplates();
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
  (req, res) => {
    const templates = getTemplates();
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

    const thumbnail = req.files && req.files.thumbnail
      ? `/templates/${req.files.thumbnail[0].filename}`
      : existing
        ? existing.thumbnail
        : '';

    let galleryImages = existing ? existing.galleryImages || [] : [];
    if (req.files && req.files.gallery) {
      const newImages = req.files.gallery.map((f) => `/templates/${f.filename}`);
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

    saveTemplates(templates);
    res.redirect('/admin/templates');
  }
);

app.get('/admin/templates/edit/:id', (req, res) => {
  const templates = getTemplates();
  const template = templates.find((t) => t.id === req.params.id);
  if (!template) return res.redirect('/admin/templates');
  res.render('admin/template-form', {
    title: 'Edit Template',
    template,
    bodyClass: 'admin-page',
  });
});

app.post('/admin/templates/delete/:id', (req, res) => {
  let templates = getTemplates();
  templates = templates.filter((t) => t.id !== req.params.id);
  saveTemplates(templates);
  res.redirect('/admin/templates');
});

// All other existing pages stay as original static HTML
app.get('/:page.html', (req, res) => {
  const page = req.params.page;
  const htmlPath = path.join(__dirname, `${page}.html`);
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  res.status(404).send('Page not found');
});

app.use(express.static(path.join(__dirname)));
app.use('/templates', express.static(path.join(__dirname, 'uploads', 'templates')));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
