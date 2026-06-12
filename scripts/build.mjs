import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

if (!existsSync(src)) {
  throw new Error('src directory is missing');
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, dist, { recursive: true });

// Dedicated deep link for Arena shares. The page is the same public observatory,
// but the base tag keeps relative static assets working from /arena/ too.
await mkdir(path.join(dist, 'arena'), { recursive: true });
const indexHtml = await readFile(path.join(dist, 'index.html'), 'utf8');
await writeFile(
  path.join(dist, 'arena', 'index.html'),
  indexHtml.replace('<head>', '<head>\n    <base href="../" />')
);

const today = new Date().toISOString().slice(0, 10);
await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://benchmarks.resyst.cl/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://benchmarks.resyst.cl/arena/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
`);

console.log('built static site into dist/');
