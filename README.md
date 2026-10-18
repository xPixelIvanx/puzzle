# Encajamos

Rompecabezas multijugador en tiempo real para parejas (o grupos pequeños) a distancia, **con sus propias fotos**.

- **Salas por enlace y código** (`/r/abcd…`, código `ABCD-EFGH-JKMN`), apodo y color, presencia en vivo, cursores con nombre y chat.
- **Foto propia**: arrastrar y soltar o selector; JPG, PNG, WebP y HEIC; corrección EXIF, recorte, redimensionado a 2048 px y compresión en el dispositivo. Galería de ilustraciones de ejemplo propias.
- **De 24 a 1000 piezas** con bordes reales (curvas Bézier con pestañas y muescas), rotación opcional (modo difícil).
- **Tablero PixiJS (WebGL)**: arrastrar con ratón o dedo, zoom con rueda y pellizco, encaje con tolerancia y grupos, imagen fantasma, vista previa (mantener espacio o botón), solo bordes, ordenar piezas sueltas por bordes o color, fondo configurable, pantalla completa, sonido al encajar, contador y tiempo, celebración final.
- **Cooperativo**: un tablero compartido; quien toma un grupo lo bloquea (transacción + reglas) hasta soltarlo; movimiento en vivo con throttling e interpolación.
- **Versus**: misma foto y misma dispersión para todos, cuenta regresiva con el reloj del servidor, barra de progreso del rival, ganador, tiempos y movimientos, revancha.
- **Persistencia**: la sala recuerda el progreso; el modo solitario se guarda en el dispositivo. Limpieza automática tras 60 días sin actividad.
- **Privacidad**: solo los miembros de la sala leen la sala y sus fotos; nadie puede listar salas; el creador puede borrar la sala y sus fotos.

Interfaz en español, con inglés incluido (selector de idioma).

## Correr en local

Requisitos: Node.js 22+.

```bash
npm install
cp .env.example .env.local   # rellena con tu proyecto de Firebase (ver SETUP.md)
npm run dev                  # http://localhost:3000
```

Sin configurar Firebase, el **modo a solas** funciona completo (no sube nada). Para el modo en línea:

- **Con tu proyecto de Firebase**: sigue [SETUP.md](SETUP.md).
- **Sin cuenta, con emuladores locales** (requiere Java 21+):
  ```bash
  npm run emulators                                   # Auth + Realtime Database con database.rules.json
  echo "NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1" >> .env.local
  npm run dev
  ```
  Abre la app en dos navegadores (o una ventana normal y otra privada) para jugar contra ti.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint sin advertencias permitidas |
| `npm run typecheck` | TypeScript estricto |
| `npm test` | Pruebas unitarias (lógica del puzzle, EXIF, saneado, limpieza) |
| `npm run test:rules` | Pruebas de `database.rules.json` contra el emulador (lo levanta Firebase CLI) |
| `npm run test:rules:running` | Igual, contra un emulador ya en marcha en `127.0.0.1:9000` |
| `npm run rules:build` | Regenera `database.rules.json` desde `scripts/build-rules.mjs` |
| `npm run check` | lint + typecheck + test + build |

## Estructura

```
src/app            rutas: /, /solo, /r/[roomId], /api/cleanup
src/components     interfaz (tablero, creador de puzzles, sala, chat…)
src/lib/puzzle     lógica pura: piezas, bordes, grupos, encaje, victoria, bloqueos (con pruebas)
src/lib/render     PixiJS: atlas de piezas, escena, entrada táctil/ratón, sonido
src/lib/game       controlador que une modelo ↔ render ↔ red
src/lib/firebase   salas, presencia, cooperativo, versus, chat
src/lib/storage    interfaz ImageStorage + adaptadores (RTDB, Firebase Storage) + caché IndexedDB
src/lib/image      HEIC, EXIF, recorte y compresión
src/i18n           español e inglés
tests/rules        pruebas de reglas de seguridad
```

Documentación: [ARCHITECTURE.md](ARCHITECTURE.md) (esquema de datos y flujo), [DECISIONS.md](DECISIONS.md),
[SETUP.md](SETUP.md) (Firebase + Vercel), [PLAN.md](PLAN.md).
