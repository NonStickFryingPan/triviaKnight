'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { generateCards } = require('./shared/generateCardsHandler');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, urlPath) {
  if (urlPath.split('/').some((seg) => seg.startsWith('.'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  let filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  if (urlPath === '/' || path.extname(filePath) === '') {
    filePath = path.join(ROOT, 'index.html');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate-cards') {
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) tooBig = true;
    });
    req.on('end', async () => {
      try {
        if (tooBig) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request too large' }));
          return;
        }
        const parsed = JSON.parse(body);
        const apiKey = (typeof parsed.apiKey === 'string' ? parsed.apiKey : '') || process.env.DEEPSEEK_KEY || '';
        const result = await generateCards({ apiKey, dumpText: parsed.dumpText, existingCategories: parsed.existingCategories });
        res.writeHead(result.statusCode || (result.error ? 400 : 200), { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.cards ? { cards: result.cards } : { error: result.error }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request: ' + err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET') {
    let urlPath;
    try {
      urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Malformed URL' }));
      return;
    }
    serveStatic(req, res, urlPath);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
}).listen(PORT, () => console.log('triviaKnight running at http://localhost:' + PORT));