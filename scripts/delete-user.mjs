#!/usr/bin/env node
// Borra un usuario del backend (cascade borra sus recetas y grupos).
// Uso: SEED_EMAIL=... SEED_PASSWORD=... node scripts/delete-user.mjs
const API = process.env.API || 'https://recetario-app-backend-production.up.railway.app/api';
const email = process.env.SEED_EMAIL;
const password = process.env.SEED_PASSWORD;

if (!email || !password) {
  console.error('Faltan SEED_EMAIL y SEED_PASSWORD');
  process.exit(1);
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  return { status: r.status, body: json };
}

const log = await req('POST', '/auth/login', { body: { email, password } });
if (log.status !== 200) {
  console.error(`Login fallo (${log.status}):`, log.body.error || log.body);
  process.exit(1);
}
const del = await req('DELETE', '/users/me', { token: log.body.token });
if (del.status === 200) {
  console.log(`✓ Usuario ${email} eliminado (cascade: recetas + grupos)`);
} else {
  console.error(`Borrado fallo (${del.status}):`, del.body);
  process.exit(1);
}
