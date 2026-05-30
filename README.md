# RecetasApp Backend

API REST en Node.js + Express + TypeScript + MongoDB (Mongoose) + JWT para la app RecetasApp.

## Setup

```bash
cd backend
npm install
cp .env.example .env   # edita JWT_SECRET y, si quieres, MONGODB_URI
npm run dev
```

Por defecto, si `MONGODB_URI` esta vacio, el backend levanta una instancia de **mongodb-memory-server** (la DB vive en RAM y se pierde al reiniciar). Para usar MongoDB Atlas o un Mongo local, pon la cadena en `.env`.

El servidor escucha en `http://localhost:4000`.

## Endpoints

Todas las rutas autenticadas requieren `Authorization: Bearer <token>`.

### Auth
- `POST /api/auth/register` — body `{ name, email, password }` → `{ user, token }`
- `POST /api/auth/login`    — body `{ email, password }` → `{ user, token }`

### Usuario actual
- `GET /api/users/me`       → datos del usuario
- `PATCH /api/users/me`     — body `{ name?, email?, password? }` → usuario actualizado
- `DELETE /api/users/me`    → borra la cuenta y, en cascada, sus recetas y grupos

### Recetas
- `GET /api/recipes`            → recetas publicas + las del usuario, orden alfabetico por titulo
  - `?mine=true` → solo las del usuario
  - `?groupId=<id>` → solo las que pertenecen a ese grupo
- `POST /api/recipes`           → crear receta
- `GET /api/recipes/:id`        → ver receta (requiere ser publica o del usuario)
- `PATCH /api/recipes/:id`      → editar (solo dueno)
- `DELETE /api/recipes/:id`     → borrar (solo dueno)

### Grupos
- `GET /api/groups`             → grupos del usuario, orden alfabetico
- `POST /api/groups`            → crear grupo
- `GET /api/groups/:id`         → grupo + recetas asociadas
- `PATCH /api/groups/:id`       → editar grupo
- `DELETE /api/groups/:id`      → borrar grupo Y sus recetas (cascade)

### Helpers grupo-receta
- `POST /api/groups/:id/recipes/:recipeId`   → asocia una receta del usuario al grupo
- `DELETE /api/groups/:id/recipes/:recipeId` → desasocia la receta del grupo (no la borra)

## Modelos

```ts
User    { id, name, email, password (hash bcrypt), createdAt }
Recipe  { id, userId, title, description, ingredients[{name,quantity,unit}], steps[], prepTime, servings, isPublic, groupIds[], createdAt }
Group   { id, userId, name, description, color, createdAt }
```

## Reglas de negocio

- Email unico (case insensitive). Email se guarda en lowercase.
- Contrasena minima 6, sin espacios. Hasheada con bcrypt.
- Recetas y grupos se devuelven ordenados alfabeticamente por `title`/`name` (collation espanol, ignora mayusculas y acentos).
- Borrar un usuario borra en cascada sus recetas y grupos.
- Borrar un grupo borra en cascada las recetas del usuario que pertenecian a ese grupo.
- Quitar una receta de un grupo (via `DELETE /api/groups/:id/recipes/:recipeId`) solo desasocia, no borra la receta.

## Scripts

- `npm run dev` — arranca en modo desarrollo con recarga automatica
- `npm run build` — compila TypeScript a `dist/`
- `npm start` — corre el build compilado
- `npm run typecheck` — solo verifica tipos
- `npm test` — smoke test end-to-end (requiere el server corriendo en otra terminal)

## Smoke test

Con el server arriba en `:4000`, en otra terminal:

```bash
node scripts/smoke-test.mjs
```

Recorre 21 verificaciones: registro/login, validacion de email/password, CRUD de recetas y grupos, orden alfabetico, filtros por grupo, permisos cruzados (un usuario no puede editar/borrar recetas de otro), feed general (solo publicas + propias) y cascade delete (borrar grupo borra sus recetas; borrar cuenta borra recetas y grupos).
