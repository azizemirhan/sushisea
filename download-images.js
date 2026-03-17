/**
 * products.json içindeki ürün resimlerini indirip images/ klasörüne kaydeder.
 * Kullanım: npm run download-images  veya  node download-images.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRODUCTS_FILE = join(__dirname, 'products.json');
const IMAGES_DIR = join(__dirname, 'images');

function slugify(name, index) {
  const s = (name || `product-${index}`)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return s || `product-${index}`;
}

function getExt(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) return ext;
  } catch (_) {}
  return 'jpg';
}

async function downloadImage(url, filepath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SushiSea/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  writeFileSync(filepath, Buffer.from(buf));
}

async function main() {
  if (!existsSync(PRODUCTS_FILE)) {
    console.error('products.json bulunamadı. Önce: npm run fetch-products');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(PRODUCTS_FILE, 'utf-8'));
  const products = data.products || [];
  const withImages = products.filter((p) => p.image && p.image.startsWith('http'));

  if (withImages.length === 0) {
    console.log('İndirilecek resim URL’i yok. Ürünlerde "image" alanı (http...) bulunmuyor.');
    return;
  }

  mkdirSync(IMAGES_DIR, { recursive: true });
  console.log(`${withImages.length} resim indiriliyor → ${IMAGES_DIR}\n`);

  const updated = [...products];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p.image || !p.image.startsWith('http')) continue;

    const base = slugify(p.name, i);
    const ext = getExt(p.image);
    const filename = `${i}-${base}.${ext}`;
    const filepath = join(IMAGES_DIR, filename);

    try {
      await downloadImage(p.image, filepath);
      const localPath = `images/${filename}`;
      const idx = updated.findIndex((x) => x.name === p.name && x.price === p.price);
      if (idx !== -1) updated[idx] = { ...updated[idx], localImage: localPath };
      ok++;
      console.log(`  ✓ ${p.name} → ${filename}`);
    } catch (err) {
      fail++;
      console.log(`  ✗ ${p.name}: ${err.message}`);
    }
  }

  // localImage eklenmiş halde products.json'u güncelle (opsiyonel)
  const output = { ...data, products: updated };
  writeFileSync(PRODUCTS_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\nBitti: ${ok} indirildi, ${fail} hata. Resimler: ${IMAGES_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
