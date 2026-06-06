#!/usr/bin/env node
// Verifica los fixes nuevos: nombre de grupo duplicado y ownership en remove
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

const suffix = Math.floor(Math.random() * 1e6);
const eA = `userA${suffix}@test.com`;
const eB = `userB${suffix}@test.com`;

// Setup 2 users
const tokenA = (await req('POST', '/auth/register', { body: { name: 'A', email: eA, password: 'pass123' } })).body.token;
const tokenB = (await req('POST', '/auth/register', { body: { name: 'B', email: eB, password: 'pass123' } })).body.token;

// === FIX 1: nombre duplicado en createGroup ===
let r = await req('POST', '/groups', { token: tokenA, body: { name: 'Postres' } });
r.status === 201 ? pass('crear primer grupo "Postres"') : fail(`crear primer grupo: ${r.status} ${JSON.stringify(r.body)}`);
r = await req('POST', '/groups', { token: tokenA, body: { name: 'Postres' } });
r.status === 409 ? pass('crear grupo con nombre duplicado -> 409') : fail(`duplicado deberia ser 409, fue ${r.status}`);
r = await req('POST', '/groups', { token: tokenA, body: { name: 'POSTRES' } });
r.status === 409 ? pass('case-insensitive: POSTRES tambien rechaza') : fail(`case-insensitive: ${r.status}`);
r = await req('POST', '/groups', { token: tokenA, body: { name: '  Postres  ' } });
r.status === 409 ? pass('whitespace-insensitive: "  Postres  " tambien rechaza') : fail(`whitespace: ${r.status}`);
// otro usuario puede usar el mismo nombre
r = await req('POST', '/groups', { token: tokenB, body: { name: 'Postres' } });
r.status === 201 ? pass('otro usuario puede usar el mismo nombre "Postres"') : fail(`user B: ${r.status}`);

// === FIX 2: nombre duplicado en updateGroup ===
const groupAlt = (await req('POST', '/groups', { token: tokenA, body: { name: 'Aperitivos' } })).body.group;
r = await req('PATCH', `/groups/${groupAlt.id}`, { token: tokenA, body: { name: 'Postres' } });
r.status === 409 ? pass('rename a nombre que ya tiene otro grupo -> 409') : fail(`rename duplicado: ${r.status} ${JSON.stringify(r.body)}`);
// permitir renombrar a si mismo
r = await req('PATCH', `/groups/${groupAlt.id}`, { token: tokenA, body: { name: 'Aperitivos' } });
r.status === 200 ? pass('renombrar a mismo nombre del propio grupo OK') : fail(`mismo nombre: ${r.status}`);
// permitir renombrar a algo nuevo
r = await req('PATCH', `/groups/${groupAlt.id}`, { token: tokenA, body: { name: 'Entrantes' } });
r.status === 200 ? pass('renombrar a nombre nuevo OK') : fail(`nombre nuevo: ${r.status}`);

// === FIX 3: ownership en removeRecipeFromGroup ===
const groupB = (await req('POST', '/groups', { token: tokenB, body: { name: 'Solo B' } })).body.group;
const recipeA = (await req('POST', '/recipes', { token: tokenA, body: { title: 'RecA' } })).body.recipe;
// A intenta quitar su receta del grupo de B -> 404 (grupo no le pertenece)
r = await req('DELETE', `/groups/${groupB.id}/recipes/${recipeA.id}`, { token: tokenA });
r.status === 404 ? pass('A no puede usar grupo de B en removeRecipe (404)') : fail(`ownership: ${r.status}`);

console.log(`\nResultado: ${passed} pass, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
