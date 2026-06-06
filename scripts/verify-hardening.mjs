#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
const API = process.env.API || 'https://recetario-app-backend-production.up.railway.app/api';
let passed = 0, failed = 0;
const pass = m => { passed++; console.log('PASS:', m); };
const fail = m => { failed++; console.error('FAIL:', m); };
async function req(method, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  const r = await fetch(API + path, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await r.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text.slice(0, 200) }; }
  return { status: r.status, body: json };
}

const suf = randomUUID().slice(0, 8);
const tok = (await req('POST', '/auth/register', { body: { name: 'Hard', email: 'hard' + suf + '@x.com', password: 'pass123' } })).body.token;

console.log('--- token revocation ---');
await req('DELETE', '/users/me', { token: tok });
let r = await req('GET', '/users/me', { token: tok });
r.status === 401 ? pass('token de cuenta borrada rechazado con 401') : fail(`token reuse: ${r.status} ${JSON.stringify(r.body)}`);
r = await req('GET', '/recipes', { token: tok });
r.status === 401 ? pass('cualquier endpoint rechaza token de cuenta borrada') : fail(`feed con token borrado: ${r.status}`);

const tok2 = (await req('POST', '/auth/register', { body: { name: 'B', email: 'b' + suf + '@x.com', password: 'pass123' } })).body.token;

console.log('\n--- input validation strict ---');
r = await req('POST', '/recipes', { token: tok2, body: { title: 'Title\nwith\nnewlines' } });
r.status === 400 ? pass('title con newlines -> 400') : fail(`newlines: ${r.status}`);

r = await req('POST', '/recipes', { token: tok2, body: { title: 'OK', prepTime: -5 } });
r.status === 400 ? pass('prepTime negativo -> 400') : fail(`prepTime neg: ${r.status}`);

r = await req('POST', '/recipes', { token: tok2, body: { title: 'OK', prepTime: 10.5 } });
r.status === 400 ? pass('prepTime decimal -> 400') : fail(`prepTime decimal: ${r.status}`);

r = await req('POST', '/recipes', { token: tok2, body: { title: 'OK', servings: 0 } });
r.status === 400 ? pass('servings 0 -> 400') : fail(`servings 0: ${r.status}`);

r = await req('POST', '/recipes', { token: tok2, body: { title: 'OK', servings: -5 } });
r.status === 400 ? pass('servings negativo -> 400') : fail(`servings neg: ${r.status}`);

r = await req('POST', '/recipes', { token: tok2, body: { title: 'OK' } });
r.status === 201 ? pass('crear sin prepTime/servings usa defaults (no obligatorios)') : fail(`defaults: ${r.status}`);

console.log('\n--- image validation strict ---');
r = await req('POST', '/recipes', { token: tok2, body: { title: 'OK', image: 'data:image/jpeg,sinbase64' } });
r.status === 400 ? pass('image data URI sin ;base64, -> 400') : fail(`bad uri: ${r.status}`);

r = await req('POST', '/recipes', { token: tok2, body: { title: 'OK', image: 'data:image/png;base64,###noisy@@@' } });
r.status === 400 ? pass('image con caracteres no-base64 -> 400') : fail(`noisy: ${r.status}`);

console.log('\n--- login email format ---');
r = await req('POST', '/auth/login', { body: { email: 'not-an-email', password: 'pass' } });
r.status === 400 ? pass('login con email mal formato -> 400 (antes era 404)') : fail(`login fmt: ${r.status}`);

console.log('\n--- arrays limited ---');
const manyIng = Array.from({ length: 200 }, (_, i) => ({ name: 'i' + i, quantity: '1', unit: 'u' }));
r = await req('POST', '/recipes', { token: tok2, body: { title: 'Many', ingredients: manyIng } });
r.status === 201 && r.body.recipe.ingredients.length === 50 ? pass('200 ingredientes se reducen a 50 max') : fail(`many: ${r.status}, count=${r.body.recipe?.ingredients?.length}`);

const manySteps = Array.from({ length: 200 }, (_, i) => 'paso ' + i);
r = await req('POST', '/recipes', { token: tok2, body: { title: 'Steps', steps: manySteps } });
r.status === 201 && r.body.recipe.steps.length === 100 ? pass('200 pasos se reducen a 100 max') : fail(`steps: ${r.status}, count=${r.body.recipe?.steps?.length}`);

console.log('\n--- payload too big ---');
const huge = 'a'.repeat(11 * 1024 * 1024);
r = await req('POST', '/recipes', { token: tok2, body: { title: 'Huge', description: huge } });
r.status === 413 ? pass('payload > 10MB -> 413 (no 500)') : fail(`big: ${r.status}`);

console.log('\n--- JSON invalido ---');
try {
  const rawR = await fetch(API + '/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok2 },
    body: 'not-json{',
  });
  rawR.status === 400 ? pass('JSON invalido -> 400 (no 500)') : fail(`bad json: ${rawR.status}`);
} catch (e) { fail(`bad json threw: ${e.message}`); }

await req('DELETE', '/users/me', { token: tok2 });
console.log(`\nResultado: ${passed} pass, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
