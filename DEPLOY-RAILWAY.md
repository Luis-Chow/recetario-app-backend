# Desplegar el backend en Railway

Este repo es **solo el backend** (Node + Express + MongoDB + JWT). Railway lo
despliega directamente desde la raíz del repositorio.

```
MongoDB Atlas (DB en la nube)
      |
Railway  ->  https://recetas-backend-production.up.railway.app
      |
App (celular)  --internet-->  backend
```

## 1. Base de datos — MongoDB Atlas (gratis)

1. Crea cuenta en https://www.mongodb.com/cloud/atlas/register y un **cluster M0** (gratis).
2. **Database Access** → crea un usuario con contraseña (solo letras y números) y rol *Read and write to any database*.
3. **Network Access** → *Add IP Address* → **Allow access from anywhere** (`0.0.0.0/0`).
4. **Connect → Drivers** → copia la cadena y deja algo así (con el nombre de la DB `recetas`):

   ```
   mongodb+srv://USUARIO:PASSWORD@cluster0.xxxxx.mongodb.net/recetas?retryWrites=true&w=majority
   ```

   Esa cadena es tu **`MONGODB_URI`**.

## 2. Subir este repo a GitHub

```bash
git remote add origin https://github.com/TU-USUARIO/recetas-backend.git
git branch -M main
git push -u origin main
```

## 3. Desplegar en Railway

1. Entra a https://railway.app e inicia sesión con GitHub.
2. **New Project** → **Deploy from GitHub repo** → elige `recetas-backend`.
   Railway detecta Node automáticamente (Nixpacks): instala, compila (`npm run build`)
   y arranca (`npm start`). El `railway.json` ya define el arranque y el health check.
3. Pestaña **Variables** → agrega:

   | Variable | Valor |
   |----------|-------|
   | `MONGODB_URI` | tu cadena de Atlas (paso 1) |
   | `JWT_SECRET` | cualquier texto largo y aleatorio |
   | `MONGOMS_DISABLE_POSTINSTALL` | `1` |

   > `PORT` lo inyecta Railway solo; no lo pongas. El código ya lee `process.env.PORT`.

4. **Settings → Networking → Generate Domain** para obtener la URL pública,
   p. ej. `https://recetas-backend-production.up.railway.app`.
5. **Verifica** abriendo en el navegador:

   ```
   https://TU-URL.up.railway.app/api/health
   ```

   Debe responder: `{"ok":true,"service":"recetas-backend"}`

> 💡 Railway ya no tiene plan gratis permanente: da un crédito de prueba (~$5) y
> luego cobra desde ~$5/mes. Si necesitas algo 100% gratis, Render funciona igual
> (root del servicio = raíz de este repo, build `npm install && npm run build`,
> start `npm start`).

## 4. Conectar la app (frontend)

En el proyecto del frontend, crea/edita `.env` con la URL de Railway **sin `/api` ni `/` final**:

```
EXPO_PUBLIC_API_URL=https://TU-URL.up.railway.app
```

Reinicia Expo con `npx expo start --clear`. Listo: registro e inicio de sesión
funcionan por internet desde cualquier dispositivo.

## Variables de entorno (resumen)

| Dónde | Variable | Valor |
|-------|----------|-------|
| Railway | `MONGODB_URI` | cadena de MongoDB Atlas |
| Railway | `JWT_SECRET` | texto aleatorio largo |
| Railway | `MONGOMS_DISABLE_POSTINSTALL` | `1` |
| App (`.env`) | `EXPO_PUBLIC_API_URL` | `https://...up.railway.app` (sin `/api`) |
