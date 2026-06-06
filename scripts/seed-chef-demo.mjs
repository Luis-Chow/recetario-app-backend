#!/usr/bin/env node
// Siembra Atlas con un usuario "Chef Demo" y recetas publicas variadas.
// Uso: node scripts/seed-chef-demo.mjs
// Requiere: scripts/.recipes-data.json (generado por el workflow seed-recetas-chef-demo)

import fs from 'fs';

const API = process.env.API || 'https://recetario-app-backend-production.up.railway.app/api';
const DEMO = {
  name: process.env.SEED_NAME || 'Chef Demo',
  email: process.env.SEED_EMAIL || 'chefdemo@recetas.app',
  password: process.env.SEED_PASSWORD || 'chefdemo123',
};

const GROUP_DEFS = [
  { key: 'desayunos',   name: 'Desayunos',           color: '#F59E0B', description: 'Para empezar el dia con energia' },
  { key: 'aperitivos',  name: 'Aperitivos',          color: '#10B981', description: 'Entradas y picadas' },
  { key: 'principales', name: 'Platos principales',  color: '#E8735A', description: 'Comidas completas' },
  { key: 'sopas',       name: 'Sopas y cremas',      color: '#8B5CF6', description: 'Reconfortantes y caseras' },
  { key: 'postres',     name: 'Postres',             color: '#EC4899', description: 'Para endulzar la comida' },
  { key: 'bebidas',     name: 'Bebidas',             color: '#3B82F6', description: 'Frias, calientes y refrescantes' },
  { key: 'vegetariana', name: 'Vegetariana',         color: '#16A34A', description: 'Sin carne ni pescado' },
  { key: 'rapidas',     name: 'Rapidas (15 min)',    color: '#F97316', description: 'Listas en 15 minutos o menos' },
];

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

async function ensureDemoUser() {
  const reg = await req('POST', '/auth/register', { body: DEMO });
  if (reg.status === 201) {
    console.log('✓ Usuario Chef Demo creado');
    return reg.body.token;
  }
  if (reg.status === 409) {
    console.log('• Chef Demo ya existe, haciendo login...');
    const log = await req('POST', '/auth/login', { body: { email: DEMO.email, password: DEMO.password } });
    if (log.status !== 200) {
      throw new Error(`Login fallo: ${log.status} ${JSON.stringify(log.body)}`);
    }
    return log.body.token;
  }
  throw new Error(`Registro fallo: ${reg.status} ${JSON.stringify(reg.body)}`);
}

async function cleanSlate(token) {
  const groups = (await req('GET', '/groups', { token })).body.groups || [];
  for (const g of groups) {
    await req('DELETE', `/groups/${g.id}`, { token });
  }
  // Si quedo alguna receta sin grupo, borrarla tambien
  const recipes = (await req('GET', '/recipes?mine=true', { token })).body.recipes || [];
  for (const r of recipes) {
    await req('DELETE', `/recipes/${r.id}`, { token });
  }
  console.log(`✓ Limpieza previa: ${groups.length} grupos y ${recipes.length} recetas residuales`);
}

async function createGroups(token) {
  const map = {};
  for (const def of GROUP_DEFS) {
    const r = await req('POST', '/groups', {
      token,
      body: { name: def.name, color: def.color, description: def.description },
    });
    if (r.status !== 201) {
      console.warn(`  ! Grupo "${def.name}" fallo: ${r.status} ${JSON.stringify(r.body)}`);
      continue;
    }
    map[def.key] = r.body.group.id;
  }
  console.log(`✓ Grupos creados: ${Object.keys(map).length}/${GROUP_DEFS.length}`);
  return map;
}

async function uploadRecipes(token, groupMap, recipes) {
  let ok = 0, fail = 0;
  for (const r of recipes) {
    const groupIds = (r.categoryKeys || [])
      .map(k => groupMap[k])
      .filter(Boolean);
    const body = {
      title: (r.title || '').slice(0, 80),
      description: (r.description || '').slice(0, 1000),
      prepTime: Math.max(1, Math.min(Number(r.prepTime) || 30, 1440)),
      servings: Math.max(1, Math.min(Number(r.servings) || 4, 100)),
      isPublic: true,
      ingredients: (r.ingredients || []).map(i => ({
        name: String(i.name || '').slice(0, 60),
        quantity: String(i.quantity || '').slice(0, 10),
        unit: String(i.unit || '').slice(0, 20),
      })),
      steps: (r.steps || []).map(s => String(s).slice(0, 500)),
      groupIds,
    };
    const res = await req('POST', '/recipes', { token, body });
    if (res.status === 201) {
      ok++;
      const groupNames = groupIds
        .map(gid => GROUP_DEFS.find(g => groupMap[g.key] === gid)?.name)
        .filter(Boolean)
        .join(', ');
      console.log(`  ✓ ${body.title}  [${groupNames}]`);
    } else {
      fail++;
      console.warn(`  ! ${body.title}: ${res.status} ${JSON.stringify(res.body).slice(0, 150)}`);
    }
  }
  console.log(`\nResumen: ${ok} subidas, ${fail} fallidas`);
  return { ok, fail };
}

async function main() {
  const dataPath = new URL('./.recipes-data.json', import.meta.url);
  const recipes = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Recetas a sembrar: ${recipes.length}`);
  console.log(`Backend: ${API}\n`);

  const token = await ensureDemoUser();
  await cleanSlate(token);
  const groupMap = await createGroups(token);
  console.log('');
  console.log('Subiendo recetas...');
  const { ok, fail } = await uploadRecipes(token, groupMap, recipes);

  console.log('\n--- VERIFICACION FINAL ---');
  const finalGroups = await req('GET', '/groups', { token });
  console.log(`Grupos en DB: ${finalGroups.body.groups?.length}`);
  const finalRecipes = await req('GET', '/recipes?mine=true', { token });
  console.log(`Recetas en DB del demo: ${finalRecipes.body.recipes?.length}`);
  const publicFeed = await req('GET', '/recipes', { token });
  console.log(`Total visibles en feed publico (con ojo del demo): ${publicFeed.body.recipes?.length}`);

  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
