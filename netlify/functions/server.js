const { connectLambda } = require('@netlify/blobs');
const serverless = require('serverless-http');
const { app } = require('../../app');

const expressHandler = serverless(app, {
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

// Lambda compatibility mode does not auto-configure Blobs.
// Must call connectLambda(event) before getStore().
exports.handler = async (event, context) => {
  try {
    connectLambda(event);
  } catch (err) {
    console.error('connectLambda error:', err);
  }
  return expressHandler(event, context);
};
