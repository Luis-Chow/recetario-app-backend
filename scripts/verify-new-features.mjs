#!/usr/bin/env node
// Verifica los features nuevos: currentPassword, reorder, avatar, image
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
const email = `feat${suffix}@test.com`;
const token = (await req('POST', '/auth/register', { body: { name: 'Feat', email, password: 'pass123' } })).body.token;

// ========= currentPassword =========
console.log('\n--- currentPassword ---');
let r = await req('PATCH', '/users/me', { token, body: { password: 'newpass123' } });
r.status === 400 && /actual/i.test(r.body.error || '') ? pass('cambiar password sin currentPassword -> 400') : fail(`sin current: ${r.status} ${JSON.stringify(r.body)}`);

r = await req('PATCH', '/users/me', { token, body: { password: 'newpass123', currentPassword: 'wrongpass' } });
r.status === 401 ? pass('currentPassword incorrecta -> 401') : fail(`currentPassword mal: ${r.status} ${JSON.stringify(r.body)}`);

r = await req('PATCH', '/users/me', { token, body: { password: 'pass123', currentPassword: 'pass123' } });
r.status === 400 && /distinta/i.test(r.body.error || '') ? pass('nueva igual a actual -> 400') : fail(`misma pass: ${r.status} ${JSON.stringify(r.body)}`);

r = await req('PATCH', '/users/me', { token, body: { password: 'newpass456', currentPassword: 'pass123' } });
r.status === 200 ? pass('cambio password con current correcta -> 200') : fail(`cambio OK: ${r.status} ${JSON.stringify(r.body)}`);

// Verificar que la nueva password funciona y la vieja no
r = await req('POST', '/auth/login', { body: { email, password: 'pass123' } });
r.status === 401 ? pass('login con password vieja -> 401') : fail(`login viejo: ${r.status}`);
r = await req('POST', '/auth/login', { body: { email, password: 'newpass456' } });
const newToken = r.status === 200 ? r.body.token : null;
newToken ? pass('login con password nueva -> 200') : fail(`login nuevo: ${r.status}`);

// Cambiar solo nombre (no debe requerir currentPassword)
r = await req('PATCH', '/users/me', { token: newToken, body: { name: 'Feat Edited' } });
r.status === 200 ? pass('cambiar solo nombre no requiere currentPassword') : fail(`solo nombre: ${r.status} ${JSON.stringify(r.body)}`);

// ========= avatar =========
console.log('\n--- avatar ---');
const smallPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
r = await req('PATCH', '/users/me', { token: newToken, body: { avatar: smallPng } });
r.status === 200 && r.body.user?.avatar === smallPng ? pass('subir avatar valido -> 200 con avatar en respuesta') : fail(`avatar OK: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

r = await req('PATCH', '/users/me', { token: newToken, body: { avatar: 'not-a-data-uri' } });
r.status === 400 ? pass('avatar invalido (no data URI) -> 400') : fail(`avatar mal: ${r.status}`);

const tooBig = 'data:image/png;base64,' + 'A'.repeat(3_500_000);
r = await req('PATCH', '/users/me', { token: newToken, body: { avatar: tooBig } });
(r.status === 400 || r.status === 413) ? pass('avatar > 2MB -> rechazado') : fail(`avatar grande: ${r.status}`);

r = await req('PATCH', '/users/me', { token: newToken, body: { avatar: '' } });
r.status === 200 && r.body.user?.avatar === '' ? pass('avatar vacio (quitar foto) -> 200') : fail(`quitar avatar: ${r.status}`);

// ========= image en Recipe =========
console.log('\n--- image en Recipe ---');
r = await req('POST', '/recipes', { token: newToken, body: { title: 'Con imagen', image: smallPng } });
const recipeId = r.body.recipe?.id;
r.status === 201 && r.body.recipe?.image === smallPng ? pass('crear receta con imagen -> 201') : fail(`crear con image: ${r.status}`);

r = await req('POST', '/recipes', { token: newToken, body: { title: 'Image mala', image: 'not-data-uri' } });
r.status === 400 ? pass('crear con image invalida -> 400') : fail(`image mala: ${r.status}`);

r = await req('PATCH', `/recipes/${recipeId}`, { token: newToken, body: { image: '' } });
r.status === 200 && r.body.recipe?.image === '' ? pass('PATCH image vacio -> quita imagen') : fail(`quitar image: ${r.status}`);

// ========= reorder groups =========
console.log('\n--- reorder groups ---');
const g1 = (await req('POST', '/groups', { token: newToken, body: { name: 'Postres' } })).body.group.id;
const g2 = (await req('POST', '/groups', { token: newToken, body: { name: 'Aperitivos' } })).body.group.id;
const g3 = (await req('POST', '/groups', { token: newToken, body: { name: 'Bebidas' } })).body.group.id;

// Por defecto orden alfabetico (Aperitivos, Bebidas, Postres)
r = await req('GET', '/groups', { token: newToken });
const defaultOrder = r.body.groups.map(g => g.name).join(',');
defaultOrder === 'Aperitivos,Bebidas,Postres' ? pass('orden por defecto alfabetico (sin reorder)') : fail(`default: ${defaultOrder}`);

// Reordenar a Postres, Bebidas, Aperitivos
r = await req('POST', '/groups/reorder', { token: newToken, body: { ids: [g1, g3, g2] } });
const reordered = r.body.groups.map(g => g.name).join(',');
reordered === 'Postres,Bebidas,Aperitivos' ? pass('reorder funciona y respeta orden manual') : fail(`reorder: ${reordered}`);

// Listar de nuevo debe respetar el orden
r = await req('GET', '/groups', { token: newToken });
const afterReorder = r.body.groups.map(g => g.name).join(',');
afterReorder === 'Postres,Bebidas,Aperitivos' ? pass('orden persiste tras GET /groups') : fail(`persistencia: ${afterReorder}`);

// Reorder con id ajeno -> ignora ese id
const intruderToken = (await req('POST', '/auth/register', { body: { name: 'B', email: `intruder${suffix}@test.com`, password: 'pass123' } })).body.token;
const gIntruder = (await req('POST', '/groups', { token: intruderToken, body: { name: 'Ajeno' } })).body.group.id;
r = await req('POST', '/groups/reorder', { token: newToken, body: { ids: [g2, gIntruder, g1, g3] } });
const filtered = r.body.groups.map(g => g.name).join(',');
filtered === 'Aperitivos,Postres,Bebidas' ? pass('reorder filtra ids ajenos y mantiene los propios') : fail(`filtrado: ${filtered}`);

// Cleanup
await req('DELETE', '/users/me', { token: newToken });
await req('DELETE', '/users/me', { token: intruderToken });

console.log(`\nResultado: ${passed} pass, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
