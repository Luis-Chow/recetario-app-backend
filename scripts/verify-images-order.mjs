#!/usr/bin/env node
const API = process.env.API || 'https://recetario-app-backend-production.up.railway.app/api';
let passed = 0, failed = 0;
const pass = m => { passed++; console.log('PASS:', m); };
const fail = m => { failed++; console.error('FAIL:', m); };
async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  return { status: r.status, body: json };
}

const suf = Math.floor(Math.random() * 1e6);
const tok = (await req('POST', '/auth/register', { body: { name: 'IO', email: `io${suf}@x.com`, password: 'pass123' } })).body.token;
const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let r = await req('POST', '/recipes', { token: tok, body: { title: 'Con imagenes', images: [tiny, tiny, tiny] } });
r.status === 201 && r.body.recipe.images?.length === 3 ? pass('crear con images[3]') : fail(`images create: ${r.status}`);
const id = r.body.recipe.id;

const tooMany = [tiny, tiny, tiny, tiny, tiny, tiny];
r = await req('POST', '/recipes', { token: tok, body: { title: 'Muchas', images: tooMany } });
r.status === 400 ? pass('crear con > 5 images -> 400') : fail(`too many: ${r.status}`);

r = await req('POST', '/recipes', { token: tok, body: { title: 'Mala img', images: ['not-data-uri'] } });
r.status === 400 ? pass('image invalida en array -> 400') : fail(`bad img: ${r.status}`);

r = await req('PATCH', `/recipes/${id}`, { token: tok, body: { images: [tiny] } });
r.status === 200 && r.body.recipe.images?.length === 1 ? pass('PATCH reemplaza array') : fail(`patch images: ${r.status}`);

r = await req('PATCH', `/recipes/${id}`, { token: tok, body: { images: [] } });
r.status === 200 && r.body.recipe.images?.length === 0 ? pass('PATCH con array vacio quita todas') : fail(`empty: ${r.status}`);

const r1 = (await req('POST', '/recipes', { token: tok, body: { title: 'Zeta' } })).body.recipe.id;
const r2 = (await req('POST', '/recipes', { token: tok, body: { title: 'Alfa' } })).body.recipe.id;
const r3 = (await req('POST', '/recipes', { token: tok, body: { title: 'Mike' } })).body.recipe.id;

const before = await req('GET', '/recipes?mine=true', { token: tok });
const orderBefore = before.body.recipes.map(x => x.title).join(',');
orderBefore.startsWith('Alfa,Con imagenes,Mike,Zeta') ? pass('sin reorder: orden alfabetico') : fail(`orden default: ${orderBefore}`);

r = await req('POST', '/recipes/reorder', { token: tok, body: { ids: [r1, r3, r2] } });
r.status === 200 ? pass('reorder -> 200') : fail(`reorder: ${r.status}`);

const after = await req('GET', '/recipes?mine=true', { token: tok });
const orderAfter = after.body.recipes.map(x => x.title);
orderAfter[0] === 'Zeta' && orderAfter[1] === 'Mike' && orderAfter[2] === 'Alfa' ? pass('orden manual respetado') : fail(`orden manual: ${orderAfter.join(',')}`);

const sufB = Math.floor(Math.random() * 1e6);
const tokB = (await req('POST', '/auth/register', { body: { name: 'BB', email: `bb${sufB}@x.com`, password: 'pass123' } })).body.token;
const rB = (await req('POST', '/recipes', { token: tokB, body: { title: 'Beta' } })).body.recipe.id;
r = await req('POST', '/recipes/reorder', { token: tok, body: { ids: [rB, r1] } });
r.status === 200 ? pass('reorder ignora ids ajenos sin error') : fail(`alien: ${r.status}`);

await req('DELETE', '/users/me', { token: tok });
await req('DELETE', '/users/me', { token: tokB });

console.log(`\nResultado: ${passed} pass, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
