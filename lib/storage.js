const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'templates.json');

function getTemplates() {
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    const data = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('getTemplates error:', err);
    return [];
  }
}

module.exports = {
  getTemplates,
};
