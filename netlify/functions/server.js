const serverless = require('serverless-http');
const { app } = require('../../app');

exports.handler = serverless(app, {
  binary: [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'application/octet-stream',
    'multipart/form-data',
  ],
});
