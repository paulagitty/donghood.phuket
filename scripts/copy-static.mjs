/**
 * Copy runtime static files into dist/ after vite build.
 */
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');

mkdirSync(path.join(dist, 'js'), { recursive: true });
for (const file of ['config.js', 'util.js', 'data.js']) {
  cpSync(path.join(root, 'js', file), path.join(dist, 'js', file));
}

const assetsSrc = path.join(root, 'assets');
const assetsDest = path.join(dist, 'assets');
if (existsSync(assetsSrc)) {
  mkdirSync(assetsDest, { recursive: true });
  cpSync(assetsSrc, assetsDest, { recursive: true });
}

console.log('✓ Copied js/config.js, util.js, data.js + assets/ → dist/');
