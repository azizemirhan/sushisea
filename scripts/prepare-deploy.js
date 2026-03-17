#!/usr/bin/env node
/**
 * Deploy için sadece site dosyalarını dist/ içine kopyalar.
 * .git ve node_modules yüklenmez, 25 MB limit aşılmaz.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

function mkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  mkdir(destDir);
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dest);
    else copyFile(src, dest);
  }
}

// Temizle ve oluştur
if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true });
mkdir(dist);

// Sadece yayınlanacak dosyalar
copyFile(path.join(root, 'index.html'), path.join(dist, 'index.html'));
copyFile(path.join(root, 'products.json'), path.join(dist, 'products.json'));
copyDir(path.join(root, 'images'), path.join(dist, 'images'));
if (fs.existsSync(path.join(root, 'en'))) {
  copyDir(path.join(root, 'en'), path.join(dist, 'en'));
}

// Kök dizindeki logo vb. varsa
const extras = ['logo.png', 'favicon.ico'];
extras.forEach((name) => {
  const src = path.join(root, name);
  if (fs.existsSync(src)) copyFile(src, path.join(dist, name));
});

console.log('dist/ hazır.');
process.exit(0);
