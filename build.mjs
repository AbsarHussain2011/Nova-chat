// Bundles the React app with esbuild into ./dist (the folder the server serves).
// Run:  npm run build:client      (needs `npm install` once for react + esbuild)
import { build } from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const dist = 'dist';
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const result = await build({
  entryPoints: { app: 'src/main.jsx' },
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outdir: dist,
  entryNames: '[name]-[hash]',
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"',
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  legalComments: 'none',
  metafile: true,
  logLevel: 'info',
});

const outs = Object.keys(result.metafile.outputs).map((f) => path.basename(f));
const js = outs.find((f) => f.endsWith('.js'));
const css = outs.find((f) => f.endsWith('.css'));
if (!js || !css) throw new Error('Expected a JS and a CSS output from esbuild');

// copy public/ -> dist/
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
};
copyDir('public', dist);

// inject hashed file names into index.html
const indexPath = path.join(dist, 'index.html');
fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace('%JS%', '/' + js).replace('%CSS%', '/' + css));

// list every file for the service worker to precache, and derive a version from their content
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
const files = walk(dist)
  .map((p) => '/' + path.relative(dist, p).split(path.sep).join('/'))
  .filter((p) => p !== '/sw.js' && !p.endsWith('.map'))
  .sort();
const hash = crypto.createHash('sha1');
for (const f of files) hash.update(f).update(fs.readFileSync(path.join(dist, f)));
const version = pkg.version + '-' + hash.digest('hex').slice(0, 8);
const precache = ['/', ...files];

const swPath = path.join(dist, 'sw.js');
fs.writeFileSync(
  swPath,
  fs.readFileSync(swPath, 'utf8').replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache, null, 2))
);
console.log(`\nBuilt NovaChat ${version} -> ${dist}/ (${files.length} files precached)`);
