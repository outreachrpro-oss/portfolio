const express = require('express');
const path = require('path');
const fs = require('fs');
const { getTemplates } = require('./lib/storage');

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

const getFilterOptions = (templates) => {
  const set = new Set();
  templates.forEach((t) => {
    if (t.category) set.add(t.category);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/portfolio.html', (req, res) => {
  const templates = getTemplates().filter((t) => t.published !== false);
  const filters = getFilterOptions(templates);
  res.render('portfolio', {
    title: 'Portfolio',
    bodyClass: 'portfolio-page',
    templates,
    filters,
  });
});

app.get('/api/templates', (req, res) => {
  try {
    const templates = getTemplates().filter((t) => t.published !== false);
    res.json({ templates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

app.get('/projects-details.html', (req, res) => {
  const slug = req.query.slug;

  if (!slug) {
    return res.sendFile(path.join(ROOT_DIR, 'projects-details.html'));
  }

  const template = getTemplates().find((t) => t.slug === slug);
  if (!template) {
    return res.status(404).send('Template not found');
  }

  res.render('projects-details', {
    title: template.title,
    template,
    bodyClass: 'template-details-page',
  });
});

// Admin removed — templates are managed in data/templates.json
app.get('/admin/templates', (req, res) => {
  res.redirect('/portfolio.html');
});

app.get('/admin/templates/*', (req, res) => {
  res.redirect('/portfolio.html');
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
