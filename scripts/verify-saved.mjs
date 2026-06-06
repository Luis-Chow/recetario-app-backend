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
const tokenA = (await req('POST', '/auth/register', { body: { name: 'AuthorA', email: `a${suf}@x.com`, password: 'pass123' } })).body.token;
const tokenB = (await req('POST', '/auth/register', { body: { name: 'ViewerB', email: `b${suf}@x.com`, password: 'pass123' } })).body.token;

// A crea receta publica
const pub = (await req('POST', '/recipes', { token: tokenA, body: { title: 'Receta A publica', isPublic: true } })).body.recipe;
// A crea receta privada
const priv = (await req('POST', '/recipes', { token: tokenA, body: { title: 'Privada A', isPublic: false } })).body.recipe;
// B crea 2 grupos
const gB1 = (await req('POST', '/groups', { token: tokenB, body: { name: 'Favoritas' } })).body.group;
const gB2 = (await req('POST', '/groups', { token: tokenB, body: { name: 'Cocina internacional' } })).body.group;
// A crea 1 grupo (no debe poderse usar por B)
const gA = (await req('POST', '/groups', { token: tokenA, body: { name: 'Soloyo' } })).body.group;

// B guarda receta publica de A en sus grupos
let r = await req('POST', `/recipes/${pub.id}/save`, { token: tokenB, body: { groupIds: [gB1.id, gB2.id] } });
r.status === 200 && r.body.saved?.groupIds?.length === 2 ? pass('B guarda publica de A con 2 grupos propios') : fail(`save: ${r.status} ${JSON.stringify(r.body)}`);

// Idempotente: guardarla otra vez funciona (upsert)
r = await req('POST', `/recipes/${pub.id}/save`, { token: tokenB, body: { groupIds: [gB1.id] } });
r.status === 200 && r.body.saved?.groupIds?.length === 1 ? pass('guardar de nuevo es idempotente (upsert) y actualiza grupos') : fail(`upsert: ${r.status}`);

// B intenta guardar receta privada de A -> 403
r = await req('POST', `/recipes/${priv.id}/save`, { token: tokenB, body: { groupIds: [] } });
r.status === 403 ? pass('guardar receta privada ajena -> 403') : fail(`privada: ${r.status}`);

// B intenta usar grupo de A -> filtra (groupIds queda vacio o sin gA)
r = await req('POST', `/recipes/${pub.id}/save`, { token: tokenB, body: { groupIds: [gA.id] } });
r.status === 200 && !r.body.saved.groupIds.includes(gA.id) ? pass('grupo ajeno se filtra al guardar') : fail(`filter: ${JSON.stringify(r.body)}`);

// A intenta guardar su propia receta -> 400
r = await req('POST', `/recipes/${pub.id}/save`, { token: tokenA, body: { groupIds: [] } });
r.status === 400 ? pass('autor no puede guardar su propia receta -> 400') : fail(`own: ${r.status}`);

// GET /recipes?mine=true para B debe incluir la guardada con isSaved=true
const mineB = await req('GET', '/recipes?mine=true', { token: tokenB });
const inMine = mineB.body.recipes.find(x => x.id === pub.id);
inMine && inMine.isSaved === true ? pass('mine=true incluye receta guardada con isSaved=true') : fail(`mine: ${JSON.stringify(inMine).slice(0,200)}`);

// GET /recipes (feed) para B debe tener isSaved en la receta de A
const feedB = await req('GET', '/recipes', { token: tokenB });
const inFeed = feedB.body.recipes.find(x => x.id === pub.id);
inFeed && inFeed.isSaved === true ? pass('feed marca receta guardada con isSaved=true') : fail(`feed: ${JSON.stringify(inFeed).slice(0,200)}`);

// Filtro por groupId de B (su grupo gB1) en mine=true
r = await req('POST', `/recipes/${pub.id}/save`, { token: tokenB, body: { groupIds: [gB1.id] } });
const filt = await req('GET', `/recipes?mine=true&groupId=${gB1.id}`, { token: tokenB });
const found = filt.body.recipes.find(x => x.id === pub.id);
found ? pass('filtro mine=true&groupId encuentra la guardada por su grupo personal') : fail(`filter group: ${JSON.stringify(filt.body)}`);

// B borra el grupo gB1 -> la receta sigue guardada pero sin ese grupo
await req('DELETE', `/groups/${gB1.id}`, { token: tokenB });
const after = await req('GET', '/recipes?mine=true', { token: tokenB });
const stillSaved = after.body.recipes.find(x => x.id === pub.id);
stillSaved && !stillSaved.groupIds.includes(gB1.id) ? pass('borrar grupo desasocia de la guardada pero la mantiene') : fail(`after delete group: ${JSON.stringify(stillSaved)}`);

// B unsave
r = await req('DELETE', `/recipes/${pub.id}/save`, { token: tokenB });
r.status === 200 ? pass('unsave -> 200') : fail(`unsave: ${r.status}`);

// Tras unsave, mine=true no la incluye
const afterUnsave = await req('GET', '/recipes?mine=true', { token: tokenB });
const stillThere = afterUnsave.body.recipes.find(x => x.id === pub.id);
!stillThere ? pass('tras unsave, mine=true no la incluye') : fail(`still there: ${JSON.stringify(stillThere)}`);

// Cleanup
await req('DELETE', '/users/me', { token: tokenA });
await req('DELETE', '/users/me', { token: tokenB });

console.log(`\nResultado: ${passed} pass, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
