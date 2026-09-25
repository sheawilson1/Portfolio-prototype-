// Local preview server for the AR lab. Serves the whole site so the lab can use /assets.
//   node ar/tools/serve.mjs            port 4420, read only
//   AR_SAVE=1 PORT=4421 node ar/tools/serve.mjs   also accepts POST /__save?path=ar/... (used by the build tools)
// Safari needs byte ranges for video and the right type for .usdz, so both are handled here.
import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT || 4420);
const SAVE = process.env.AR_SAVE === '1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.usdz': 'model/vnd.usdz+zip',
  '.mind': 'application/octet-stream', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.vcf': 'text/vcard; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

async function save(req, res, url) {
  const rel = url.searchParams.get('path') || '';
  const target = path.resolve(ROOT, rel);
  if (!target.startsWith(path.join(ROOT, 'ar') + path.sep) || req.headers['x-forwarded-for']) {
    res.writeHead(403).end('no');
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.concat(chunks));
  console.log('saved', rel, Buffer.concat(chunks).length, 'bytes');
  res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && url.pathname === '/__save' && SAVE) return await save(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();

    let file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    let stat = await fs.stat(file).catch(() => null);
    if (stat?.isDirectory()) {
      if (!url.pathname.endsWith('/')) return res.writeHead(301, { location: url.pathname + '/' + url.search }).end();
      file = path.join(file, 'index.html');
      stat = await fs.stat(file).catch(() => null);
    }
    if (!stat) return res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');

    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'content-length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'content-length': stat.size });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500).end('error');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`AR lab on http://127.0.0.1:${PORT}/ar/${SAVE ? ' (save on)' : ''}`));
