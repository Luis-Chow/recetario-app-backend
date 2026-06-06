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
const token = (await req('POST', '/auth/register', { body: { name: 'KR', email: `kr${suf}@x.com`, password: 'pass123' } })).body.token;

// Crear grupos g1, g2
const g1 = (await req('POST', '/groups', { token, body: { name: 'G1' } })).body.group;
const g2 = (await req('POST', '/groups', { token, body: { name: 'G2' } })).body.group;

// Recetas: r1 solo en g1, r2 en g1+g2, r3 solo en g2
const r1 = (await req('POST', '/recipes', { token, body: { title: 'R1', groupIds: [g1.id] } })).body.recipe;
const r2 = (await req('POST', '/recipes', { token, body: { title: 'R2', groupIds: [g1.id, g2.id] } })).body.recipe;
const r3 = (await req('POST', '/recipes', { token, body: { title: 'R3', groupIds: [g2.id] } })).body.recipe;

// Caso 1: borrar g1 con keepRecipes=true -> r1 y r2 sobreviven sin g1
let r = await req('DELETE', `/groups/${g1.id}?keepRecipes=true`, { token });
r.status === 200 ? pass('DELETE keepRecipes=true -> 200') : fail(`keep: ${r.status}`);

const after1 = await req('GET', '/recipes?mine=true', { token });
const r1After = after1.body.recipes.find(x => x.id === r1.id);
const r2After = after1.body.recipes.find(x => x.id === r2.id);
r1After && !r1After.groupIds.includes(g1.id) ? pass('R1 sobrevive sin g1') : fail(`r1: ${JSON.stringify(r1After)}`);
r2After && !r2After.groupIds.includes(g1.id) && r2After.groupIds.includes(g2.id) ? pass('R2 sobrevive con g2 (sin g1)') : fail(`r2: ${JSON.stringify(r2After)}`);

// Caso 2: borrar g2 con keepRecipes=false (default cascade) -> r2 y r3 se borran
r = await req('DELETE', `/groups/${g2.id}`, { token });
r.status === 200 ? pass('DELETE sin keepRecipes -> 200') : fail(`no keep: ${r.status}`);

const after2 = await req('GET', '/recipes?mine=true', { token });
!after2.body.recipes.find(x => x.id === r2.id) ? pass('R2 borrada en cascade') : fail('r2 sobrevivio');
!after2.body.recipes.find(x => x.id === r3.id) ? pass('R3 borrada en cascade') : fail('r3 sobrevivio');
after2.body.recipes.find(x => x.id === r1.id) ? pass('R1 (que no estaba en g2) sigue ahi') : fail('r1 desaparecio');

// Cleanup
await req('DELETE', '/users/me', { token });

console.log(`\nResultado: ${passed} pass, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
