/**
 * sushi-market.com.tr Alanya sayfasından ürünleri + resim URL'lerini çeker.
 * Her kartı tek tek viewport'a getirip resmin yüklenmesini bekler (lazy-load).
 * Kullanım: npm run fetch-products  veya  node fetch-products.js
 */

import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const URL = 'https://sushi-market.com.tr/alanya/?group=velikiipost';
const OUTPUT_FILE = 'products.json';

const CARD_SELECTOR =
  'a[href*="product"], a[href*="dish"], [class*="DishCard"], [class*="dish-card"], [class*="ProductCard"], [class*="product-card"], [class*="MenuItem"], [class*="menu-item"]';

function isPlaceholder(url) {
  if (!url || typeof url !== 'string') return true;
  return url.startsWith('data:image/gif') || url.startsWith('data:image/svg');
}

async function fetchProducts() {
  console.log('Tarayıcı açılıyor...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const imageUrls = [];
    const seenUrls = new Set();
    page.on('request', (req) => {
      const u = req.url();
      if (req.resourceType() !== 'image') return;
      if (u.startsWith('data:')) return;
      if (seenUrls.has(u)) return;
      if (!/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(u) && !/sushi-market|yandexcloud|cloudinary|img\.|static\.|cdn\./i.test(u)) return;
      seenUrls.add(u);
      imageUrls.push(u);
    });

    console.log('Sayfa yükleniyor:', URL);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));

    // Ürün listesini topla + her ürün için DOM'daki kart indeksini sakla
    const productsWithIndex = await page.evaluate((sel) => {
      const result = [];
      const seenNames = new Set();
      const cards = document.querySelectorAll(sel);

      cards.forEach((card, cardIndex) => {
        const text = (card.textContent || '').trim().replace(/\s+/g, ' ');
        const priceMatch = text.match(/(\d+)\s*₺/);
        if (!priceMatch) return;

        const price = priceMatch[1] + ' ₺';
        const nameEl = card.querySelector('h2, h3, h4, [class*="name"], [class*="title"], [class*="Name"], [class*="Title"]');
        let name = nameEl ? (nameEl.textContent || '').trim() : '';
        if (!name) {
          const beforePrice = text.split(priceMatch[0])[0].trim();
          const parts = beforePrice.split(/\d+\s*g\s+\d+\s*pcs/);
          name = (parts[0] || beforePrice).trim().slice(0, 120);
        }
        if (!name || name.length < 2) return;
        if (seenNames.has(name)) return;
        seenNames.add(name);

        const descMatch = text.match(/\d+\s*g\s+\d+\s*pcs([^.]+)/);
        let description = descMatch ? descMatch[1].trim().slice(0, 200) : null;
        if (description) description = description.replace(/\d+\s*₺\s*Add\s*$/i, '').trim();

        result.push({
          name,
          price,
          description: description || undefined,
          image: undefined,
          cardIndex,
        });
      });
      return result;
    }, CARD_SELECTOR);

    const products = productsWithIndex.map(({ cardIndex, ...p }) => p);

    if (products.length === 0) {
      console.log('Ürün kartı bulunamadı.');
      writeFileSync(OUTPUT_FILE, JSON.stringify({ source: URL, fetchedAt: new Date().toISOString(), count: 0, products: [] }, null, 2), 'utf-8');
      return;
    }

    console.log(`${products.length} ürün bulundu. Resimler yükleniyor (her kart için scroll)...`);

    for (let i = 0; i < productsWithIndex.length; i++) {
      const cardIndex = productsWithIndex[i].cardIndex;
      await page.evaluate(
        (args) => {
          const [sel, index] = args;
          const cards = document.querySelectorAll(sel);
          const card = cards[index];
          if (card) card.scrollIntoView({ behavior: 'instant', block: 'center' });
        },
        [CARD_SELECTOR, cardIndex]
      );
      await new Promise((r) => setTimeout(r, 500));

      const imageUrl = await page.evaluate(
        (args) => {
          const [sel, index] = args;
          const cards = document.querySelectorAll(sel);
          const card = cards[index];
          if (!card) return null;
          const img = card.querySelector('img');
          if (!img) return null;
          const src = img.src || '';
          const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
          const dataSrcset = img.getAttribute('data-srcset') || img.getAttribute('data-srcset');
          if (dataSrc && !dataSrc.startsWith('data:image/gif')) return dataSrc;
          if (dataSrcset) {
            const first = dataSrcset.split(',')[0].trim().split(/\s+/)[0];
            if (first && !first.startsWith('data:image/gif')) return first;
          }
          if (src && !src.startsWith('data:image/gif') && !src.startsWith('data:image/svg')) return src;
          return null;
        },
        [CARD_SELECTOR, cardIndex]
      );

      if (imageUrl && !isPlaceholder(imageUrl)) {
        products[i].image = imageUrl;
      }
      if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${products.length} kart işlendi...`);
    }

    let withImages = products.filter((p) => p.image).length;
    if (withImages < products.length && imageUrls.length >= products.length) {
      const productImageUrls = imageUrls.filter((u) => !/logo|icon|favicon|banner|avatar/i.test(u));
      products.forEach((p, i) => {
        if (!p.image && productImageUrls[i]) p.image = productImageUrls[i];
      });
      withImages = products.filter((p) => p.image).length;
    }
    console.log(`Resim URL'si alınan: ${withImages}/${products.length}`);

    const output = {
      source: URL,
      fetchedAt: new Date().toISOString(),
      count: products.length,
      products,
    };
    writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`Kaydedildi: ${OUTPUT_FILE}`);
    return output;
  } finally {
    await browser.close();
  }
}

fetchProducts().catch((err) => {
  console.error('Hata:', err.message);
  process.exit(1);
});
