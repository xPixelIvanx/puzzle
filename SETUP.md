# Puesta en marcha (lo que tienes que hacer a mano)

Todo el código está listo. Estos pasos requieren tu cuenta de Google/Firebase y de Vercel. Tiempo
estimado: 20–30 minutos. Las pantallas de Firebase cambian a veces de nombre; si algún botón no
coincide exactamente, busca el equivalente en la misma sección.

## 1. Crear el proyecto de Firebase

1. Entra en <https://console.firebase.google.com> → **Crear un proyecto** (o "Agregar proyecto").
2. Ponle un nombre (p. ej. `encajamos`). Google Analytics: **no es necesario** (puedes desactivarlo).
3. En la página del proyecto, pulsa el icono **Web `</>`** ("Agregar app") → nombre `encajamos-web` →
   **no** marques Firebase Hosting → **Registrar app**.
4. Verás un objeto `firebaseConfig`. Guárdalo: lo usarás en el paso 5.

## 2. Activar la autenticación anónima

1. Menú **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso** → **Anónimo** → **Habilitar** → **Guardar**.
3. Pestaña **Configuración → Dominios autorizados** → **Agregar dominio**: añade el dominio de Vercel
   (p. ej. `encajamos.vercel.app`) y tu dominio propio si lo tienes. `localhost` ya viene incluido.

## 3. Crear Realtime Database

1. **Compilación → Realtime Database → Crear base de datos**.
2. Ubicación: la más cercana a tus jugadores (`us-central1`, `europe-west1` o `asia-southeast1`).
3. Reglas de seguridad: **Empezar en modo bloqueado** (las reales se despliegan en el paso 4).
4. Copia la URL que aparece arriba (p. ej. `https://encajamos-default-rtdb.firebaseio.com` o
   `https://encajamos-default-rtdb.europe-west1.firebasedatabase.app`). Es `NEXT_PUBLIC_FIREBASE_DATABASE_URL`.

> **Plan gratuito (Spark)**: es suficiente. Límites relevantes: 100 conexiones simultáneas, 1 GB
> almacenado y 10 GB/mes de descarga. Cada foto ocupa ~0,3–2,5 MB y cada dispositivo la descarga una
> sola vez (queda en caché). Las salas sin actividad se borran a los 60 días (paso 7).

## 4. Desplegar las reglas de seguridad

**Dónde:** en una **terminal de tu computadora** (Terminal en macOS, PowerShell o Git Bash en Windows),
dentro de la carpeta del proyecto (la que contiene `package.json` y `firebase.json`). No es la consola
web de Firebase ni la conversación de Claude.

Si todavía no tienes el código en tu computadora:

```bash
git clone https://github.com/xPixelIvanx/puzzle.git
cd puzzle
git checkout claude/hopeful-brown-h7e5hu
```

Luego, desde esa carpeta:

```bash
npm install
npx firebase login                      # abre el navegador para iniciar sesión
npx firebase use --add                  # elige tu proyecto; alias: default
npx firebase deploy --only database     # sube database.rules.json
```

Comprueba en **Realtime Database → Reglas** que aparecen las reglas nuevas.
Si alguna vez cambias `scripts/build-rules.mjs`, ejecuta `npm run rules:build` antes de desplegar.

## 5. Variables de entorno

Copia `.env.example` a `.env.local` (para desarrollo) y rellena con los valores del paso 1 y 3:

| Variable | De dónde sale |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `firebaseConfig.apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `firebaseConfig.authDomain` |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | URL del paso 3 (`firebaseConfig.databaseURL`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `firebaseConfig.projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `firebaseConfig.storageBucket` (solo si usas Storage) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `firebaseConfig.appId` |
| `NEXT_PUBLIC_IMAGE_STORAGE` | `rtdb` (recomendado) o `firebase` (ver sección opcional) |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Paso 7 (solo en Vercel, **secreto**) |
| `CRON_SECRET` | Paso 7 (solo en Vercel, **secreto**) |

Las variables `NEXT_PUBLIC_*` no son secretas (Firebase las expone en cualquier app web); la
protección la dan las reglas. **Nunca** subas `.env.local` ni la cuenta de servicio al repositorio
(`.gitignore` ya los excluye).

Prueba en local: `npm run dev`, abre <http://localhost:3000>, crea una sala y ábrela en otro navegador.

## 6. Desplegar en Vercel

1. Sube el repositorio a GitHub (ya lo está) y entra en <https://vercel.com/new>.
2. **Import** del repositorio → Framework: **Next.js** (se detecta solo). No cambies los comandos.
3. **Environment Variables**: añade todas las de la tabla del paso 5 (las `NEXT_PUBLIC_*` y, cuando
   las tengas, `FIREBASE_SERVICE_ACCOUNT_BASE64` y `CRON_SECRET`) para *Production* y *Preview*.
4. **Deploy**. Al terminar, copia el dominio (`https://<algo>.vercel.app`).
5. Vuelve a Firebase → Authentication → **Dominios autorizados** y añade ese dominio (si no lo hiciste).
6. Si añades un dominio propio en Vercel (Settings → Domains), agrégalo también en Firebase.

## 7. Limpieza automática de salas inactivas (60 días)

`vercel.json` programa un Cron diario que llama a `/api/cleanup`. Necesita:

1. **Cuenta de servicio**: Firebase → ⚙ **Configuración del proyecto → Cuentas de servicio →
   Generar nueva clave privada**. Se descarga un JSON. Conviértelo a base64 en una sola línea:
   - macOS/Linux: `base64 -i clave.json | tr -d '\n'`
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("clave.json"))`

   Pega el resultado en Vercel como `FIREBASE_SERVICE_ACCOUNT_BASE64`. **Borra el JSON** de tu equipo
   después (o guárdalo en un gestor de contraseñas).
2. **Secreto del cron**: genera uno aleatorio (`openssl rand -hex 32`) y guárdalo en Vercel como
   `CRON_SECRET`. Vercel lo envía automáticamente como `Authorization: Bearer …`.
3. Vuelve a desplegar (Deployments → ⋯ → Redeploy). En **Settings → Cron Jobs** verás la tarea.
   En el plan Hobby los cron se ejecutan una vez al día, que es lo que se necesita.

Prueba manual: `curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-app>.vercel.app/api/cleanup`
→ `{"checked":…,"deleted":…,"failed":0}`.

## 8. Comprobación final

- [ ] En dos navegadores distintos, uno crea la sala y el otro entra con el enlace.
- [ ] Ambos ven moverse las piezas y los cursores; el chat funciona.
- [ ] Al recargar la página, el progreso sigue ahí.
- [ ] Desde una ventana privada sin el enlace no hay forma de ver la sala.

---

## Opcional: usar Cloud Storage for Firebase para las fotos

**Verificado** (FAQ oficial de Firebase sobre los cambios anunciados en septiembre de 2024): los
buckets nuevos requieren el plan **Blaze** (pago por uso; se mantiene la cuota gratuita) y, desde el
3-feb-2026, los proyectos Spark perdieron el acceso a sus buckets `*.appspot.com`. Por eso la app
guarda las fotos en Realtime Database por defecto. Si aun así prefieres Storage:

1. Cambia el proyecto a **Blaze** (⚙ → Uso y facturación). Pon una **alerta de presupuesto** baja.
2. **Compilación → Storage → Comenzar** → modo producción → ubicación.
3. `npx firebase deploy --only storage` (sube `storage.rules`).
4. **CORS** (necesario porque las piezas se recortan en un canvas): edita `cors.json` con tu dominio y
   ejecuta `gsutil cors set cors.json gs://<tu-bucket>` (o `gcloud storage buckets update gs://<tu-bucket> --cors-file=cors.json`).
5. En Vercel: `NEXT_PUBLIC_IMAGE_STORAGE=firebase` y `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<tu-bucket>`.

Limitación: las reglas de Storage no pueden consultar Realtime Database, así que no pueden comprobar
la membresía. La protección es: sesión obligatoria, rutas imposibles de adivinar (roomId de 60 bits +
imageId de 131 bits que solo conocen los miembros), listado prohibido y validación de tamaño/tipo.

## Alternativas para las fotos (Vercel Blob, Supabase Storage)

Toda la app usa la interfaz `ImageStorage` (`src/lib/storage/ImageStorage.ts`) con tres métodos:
`upload`, `download` y `remove`. Para cambiar de proveedor:

1. Crea `src/lib/storage/miProveedor.ts` que implemente la interfaz.
2. Regístralo en `storageFor()` (`src/lib/storage/index.ts`) y añade el valor a `ImageStorageKind`.
3. Ajusta la validación `storage` en `scripts/build-rules.mjs` y ejecuta `npm run rules:build`.

- **Supabase Storage**: bucket privado + políticas RLS. Como la membresía vive en Firebase, lo más
  sencillo es una ruta API de Next que verifique el ID token de Firebase (`firebase-admin`), compruebe
  `rooms/{id}/members/{uid}` y devuelva una URL firmada de corta duración.
- **Vercel Blob**: el SDK de servidor sube y borra; para mantener la privacidad, sirve las descargas a
  través de una ruta API que haga la misma comprobación de membresía, en lugar de URLs públicas.

## Recomendaciones de seguridad extra (opcionales)

- **Restringe la API key**: Google Cloud Console → APIs y servicios → Credenciales → la clave del
  navegador → *Restricciones de aplicaciones: sitios web* → tus dominios.
- **App Check** (reCAPTCHA Enterprise) reduce abusos de bots contra la base de datos.
- Revisa de vez en cuando **Realtime Database → Uso** para vigilar la cuota.
