#!/usr/bin/env node
// Smoke test del backend con fetch nativo de Node.
// Uso: node scripts/smoke-test.mjs   (con el server corriendo en :4000)

const API = process.env.API || 'http://localhost:4000/api';

let passed = 0;
let failed = 0;

function pass(msg) { passed++; console.log('PASS:', msg); }
function fail(msg) { failed++; console.error('FAIL:', msg); }

async function req(method, path, { token, body, expect } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  if (expect !== undefined && r.status !== expect) {
    throw new Error(`${method} ${path} -> esperaba ${expect}, recibio ${r.status}. body=${text}`);
  }
  return { status: r.status, body: json };
}

async function expectStatus(name, method, path, opts, status) {
  try {
    await req(method, path, { ...opts, expect: status });
    pass(name);
  } catch (e) {
    fail(`${name}: ${e.message}`);
  }
}

async function main() {
  const suffix = `${Math.floor(Math.random() * 1e6)}`;
  const email1 = `luis${suffix}@example.com`;
  const email2 = `ana${suffix}@example.com`;

  // 1) health
  const h = await req('GET', '/health');
  if (h.body.ok === true) pass('health'); else fail(`health: ${JSON.stringify(h.body)}`);

  // 2) registro
  const reg = await req('POST', '/auth/register', {
    body: { name: 'Luis', email: email1, password: 'pass123' },
    expect: 201,
  });
  const token = reg.body.token;
  const userId = reg.body.user.id;
  if (token && userId) pass('registro'); else fail('registro sin token/userId');

  // 3) email duplicado
  await expectStatus('email duplicado rechazado', 'POST', '/auth/register',
    { body: { name: 'Otro', email: email1, password: 'pass123' } }, 409);

  // 4) password con espacios
  await expectStatus('password con espacios rechazado', 'POST', '/auth/register',
    { body: { name: 'X', email: `x${suffix}@example.com`, password: 'con espacio' } }, 400);

  // 5) login email inexistente
  await expectStatus('login email inexistente', 'POST', '/auth/login',
    { body: { email: `nadie${suffix}@example.com`, password: 'pass123' } }, 404);

  // 6) login password mala
  await expectStatus('login password incorrecta', 'POST', '/auth/login',
    { body: { email: email1, password: 'mala' } }, 401);

  // 7) GET /users/me
  const me = await req('GET', '/users/me', { token, expect: 200 });
  if (me.body.user.id === userId) pass('GET /users/me'); else fail('GET /users/me id mismatch');

  // 8) crear 3 grupos en orden no alfabetico
  const g1 = (await req('POST', '/groups', { token, body: { name: 'Postres', color: '#ff0' }, expect: 201 })).body.group.id;
  const g2 = (await req('POST', '/groups', { token, body: { name: 'Aperitivos', color: '#0f0' }, expect: 201 })).body.group.id;
  const g3 = (await req('POST', '/groups', { token, body: { name: 'Bebidas', color: '#00f' }, expect: 201 })).body.group.id;
  pass('creados 3 grupos');

  // 9) listar grupos -> alfabetico
  const gs = await req('GET', '/groups', { token, expect: 200 });
  const gnames = gs.body.groups.map(g => g.name).join(',');
  if (gnames === 'Aperitivos,Bebidas,Postres') pass('grupos ordenados alfabeticamente');
  else fail(`orden de grupos: ${gnames}`);

  // 10) 3 recetas en orden no alfabetico, una en multiples grupos
  const r1 = (await req('POST', '/recipes', { token, body: { title: 'Zarangollo', description: 'Murciano', groupIds: [g2], isPublic: true }, expect: 201 })).body.recipe.id;
  const r2 = (await req('POST', '/recipes', { token, body: { title: 'Arroz con leche', description: 'Postre', groupIds: [g1] }, expect: 201 })).body.recipe.id;
  const r3 = (await req('POST', '/recipes', { token, body: { title: 'Mojito', description: 'Bebida', groupIds: [g3, g2] }, expect: 201 })).body.recipe.id;
  pass('creadas 3 recetas (una en multiples grupos)');

  // 11) mis recetas -> alfabetico
  const mine = await req('GET', '/recipes?mine=true', { token, expect: 200 });
  const titles = mine.body.recipes.map(r => r.title).join(',');
  if (titles === 'Arroz con leche,Mojito,Zarangollo') pass('recetas ordenadas alfabeticamente');
  else fail(`orden de recetas: ${titles}`);

  // 12) filtrar por groupId
  const byG2 = await req('GET', `/recipes?groupId=${g2}`, { token, expect: 200 });
  const t2 = byG2.body.recipes.map(r => r.title).join(',');
  if (t2 === 'Mojito,Zarangollo') pass('filtro por groupId (receta en multiples grupos)');
  else fail(`filtro groupId G2: ${t2}`);

  // 13) editar receta
  const upd = await req('PATCH', `/recipes/${r3}`, { token, body: { title: 'Mojito clasico' }, expect: 200 });
  if (upd.body.recipe.title === 'Mojito clasico') pass('PATCH receta');
  else fail('PATCH receta no actualizo titulo');

  // 14) segundo usuario
  const reg2 = await req('POST', '/auth/register', {
    body: { name: 'Ana', email: email2, password: 'pass123' },
    expect: 201,
  });
  const token2 = reg2.body.token;

  // U2 no puede borrar receta de U1
  await expectStatus('no se puede borrar receta ajena', 'DELETE', `/recipes/${r1}`, { token: token2 }, 403);

  // 15) feed general: U2 solo ve publicas + propias (de momento ninguna propia)
  const feed = await req('GET', '/recipes', { token: token2, expect: 200 });
  const ft = feed.body.recipes.map(r => r.title).join(',');
  if (ft === 'Zarangollo') pass('feed general muestra solo publicas + propias');
  else fail(`feed U2: esperaba "Zarangollo", recibio "${ft}"`);

  // 16) quitar receta de grupo (no borra)
  await req('DELETE', `/groups/${g2}/recipes/${r3}`, { token, expect: 200 });
  const r3after = await req('GET', `/recipes/${r3}`, { token, expect: 200 });
  if (r3after.body.recipe.groupIds.length === 1 && r3after.body.recipe.title === 'Mojito clasico') {
    pass('quitar de grupo solo desasocia');
  } else {
    fail(`tras quitar de G2: groupIds=${r3after.body.recipe.groupIds.length} title=${r3after.body.recipe.title}`);
  }

  // 17) borrar grupo -> borra recetas que pertenecian
  await req('DELETE', `/groups/${g1}`, { token, expect: 200 });
  await expectStatus('borrar grupo borra sus recetas en cascada', 'GET', `/recipes/${r2}`, { token }, 404);

  // 18) editar perfil + email duplicado
  const pname = await req('PATCH', '/users/me', { token, body: { name: 'Luis editado' }, expect: 200 });
  if (pname.body.user.name === 'Luis editado') pass('PATCH /users/me nombre');
  else fail('PATCH /users/me nombre no actualizo');
  await expectStatus('email duplicado en /users/me rechazado', 'PATCH', '/users/me',
    { token, body: { email: email2 } }, 409);

  // 19) DELETE /users/me + cascade
  await req('DELETE', '/users/me', { token, expect: 200 });
  await expectStatus('tras delete /me, login devuelve 404', 'POST', '/auth/login',
    { body: { email: email1, password: 'pass123' } }, 404);

  // 20) acceso sin token -> 401
  await expectStatus('401 sin token', 'GET', '/recipes', {}, 401);

  console.log('');
  console.log(`Resultado: ${passed} pass, ${failed} fail`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
