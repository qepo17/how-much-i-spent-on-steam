import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const LIBRARY = resolve(ROOT, 'data/library.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Only data/library.json and files under public/ are reachable. */
function fileFor(pathname) {
  if (pathname === '/data/library.json') return LIBRARY;
  const file = resolve(PUBLIC, `.${pathname === '/' ? '/index.html' : pathname}`);
  return file.startsWith(PUBLIC + sep) ? file : null;
}

http
  .createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return res.writeHead(400).end('Bad request');
    }
    const file = fileFor(pathname);
    const type = file && TYPES[extname(file)];
    if (!type) return res.writeHead(404).end('Not found');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Open http://localhost:${PORT}`));
