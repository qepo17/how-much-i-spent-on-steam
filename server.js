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
  '.woff2': 'font/woff2',
};

// A web page can point its own domain at 127.0.0.1 (DNS rebinding) and then read this server as same-origin.
// The browser still sends that domain in Host, so anything but our own address is refused.
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

// Fonts, scripts and styles are all local; only Steam's image CDN is allowed from outside.
// Inline style attributes stay allowed because charts size their bars with them.
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: https://*.steamstatic.com",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** Only data/library.json and files under public/ are reachable. */
function fileFor(pathname) {
  if (pathname === '/data/library.json') return LIBRARY;
  const file = resolve(PUBLIC, `.${pathname === '/' ? '/index.html' : pathname}`);
  return file.startsWith(PUBLIC + sep) ? file : null;
}

http
  .createServer(async (req, res) => {
    if (!ALLOWED_HOSTS.has(req.headers.host)) return res.writeHead(403).end('Forbidden');
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
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Open http://localhost:${PORT}`));
