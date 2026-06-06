#!/usr/bin/env node
// Descarga una imagen de Internet por cada receta del usuario y la sube como base64.
// Uso:
//   SEED_EMAIL=luisfchow69@gmail.com SEED_PASSWORD=Admin123 node scripts/seed-recipe-images.mjs
import { Buffer } from 'node:buffer';

const API = process.env.API || 'https://recetario-app-backend-production.up.railway.app/api';
const EMAIL = process.env.SEED_EMAIL || 'luisfchow69@gmail.com';
const PASSWORD = process.env.SEED_PASSWORD || 'Admin123';

const TITLE_TO_QUERY = {
  'Tostadas francesas con miel y canela': 'french-toast',
  'Arepas de queso rellenas': 'arepa',
  'Chilaquiles verdes con huevo': 'chilaquiles',
  'Tequenos venezolanos clasicos': 'tequenos',
  'Bruschetta italiana de tomate y albahaca': 'bruschetta',
  'Gyozas de cerdo y repollo estilo japones': 'gyoza',
  'Bistec encebollado a la criolla': 'steak-onions',
  'Pollo tikka masala': 'tikka-masala',
  'Pasta primavera con vegetales salteados': 'pasta-primavera',
  'Flan napolitano clasico': 'flan-caramel',
  'Mousse de mango cremoso': 'mango-mousse',
  'Carlota de limon sin horno': 'lemon-cake',
  'Chocolate Caliente Cremoso': 'hot-chocolate',
  'Limonada de Fresa Refrescante': 'strawberry-lemonade',
  'Crema de calabaza con jengibre': 'pumpkin-soup',
  'Sopa de lentejas con verduras y chorizo': 'lentil-soup',
  'Risotto cremoso de championes y espinacas': 'mushroom-risotto',
  'Curry de garbanzos con leche de coco y espinacas': 'chickpea-curry',
  'Ensalada de pollo, aguacate y crocante de tocino': 'chicken-salad-avocado',
  'Pasta express al ajillo con camarones y limon': 'shrimp-pasta',
};

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  return { status: r.status, body: json };
}

async function downloadAsDataUri(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return `data:${contentType};base64,${base64}`;
}

async function pickImage(query) {
  // LoremFlickr da una imagen aleatoria por keyword. 600x600 ≈ 30-80 KB encoded.
  const url = `https://loremflickr.com/600/600/${query},food?lock=${Math.floor(Math.random() * 1e6)}`;
  return downloadAsDataUri(url);
}

async function main() {
  console.log(`Backend: ${API}`);
  console.log(`Login como ${EMAIL}...`);
  const log = await req('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (log.status !== 200) {
    console.error(`Login fallo: ${log.status}`, log.body);
    process.exit(1);
  }
  const token = log.body.token;

  const list = await req('GET', '/recipes?mine=true', { token });
  const own = list.body.recipes.filter(r => !r.isSaved);
  console.log(`Recetas propias: ${own.length}\n`);

  let ok = 0, fail = 0;
  for (const r of own) {
    const query = TITLE_TO_QUERY[r.title] || r.title.split(' ').slice(0, 2).join('-').toLowerCase();
    process.stdout.write(`  ${r.title}  [${query}]  ... `);
    try {
      const dataUri = await pickImage(query);
      const sizeKb = Math.round(dataUri.length / 1024);
      const patch = await req('PATCH', `/recipes/${r.id}`, { token, body: { image: dataUri } });
      if (patch.status === 200) {
        ok++;
        console.log(`✓ ${sizeKb} KB`);
      } else {
        fail++;
        console.log(`✗ ${patch.status} ${JSON.stringify(patch.body).slice(0, 100)}`);
      }
    } catch (e) {
      fail++;
      console.log(`✗ ${e.message}`);
    }
  }

  console.log(`\nResumen: ${ok} actualizadas, ${fail} fallidas`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
