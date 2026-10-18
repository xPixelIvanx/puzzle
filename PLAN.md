# Plan de trabajo

App web de rompecabezas multijugador en tiempo real para parejas a distancia, con fotos propias.

## Fases

| # | Fase | Resultado verificable |
|---|------|-----------------------|
| 1 | Plan, esquema de datos y andamiaje | `PLAN.md`, `ARCHITECTURE.md`, `DECISIONS.md`; Next.js + TS + Tailwind compilando |
| 2 | Lógica del puzzle sin red + pruebas | `src/lib/puzzle/*` (cuadrícula, bordes Bézier, grupos, snapping, victoria, bloqueos) con Vitest |
| 3 | Tablero solitario con imagen propia | Subida (arrastrar/soltar), HEIC, EXIF, recorte, compresión, atlas de piezas, PixiJS, zoom/pan/pellizco, rotación, vista previa, fantasma, solo bordes, ordenar |
| 4 | Salas, presencia y cooperativo | Firebase Auth anónima, RTDB, enlace + código, apodo y color, cursores, bloqueo por transacción, throttling + interpolación, persistencia |
| 5 | Versus | Tablero propio por jugador con la misma semilla, cuenta regresiva con reloj del servidor, barra del rival, ganador, revancha |
| 6 | Chat, extras y pulido | Chat sanitizado, sonido, celebración, responsive, accesibilidad, i18n es/en |
| 7 | Seguridad, limpieza y documentación | `database.rules.json`, `storage.rules`, pruebas de reglas con emulador, limpieza a 60 días (Vercel Cron), borrado de sala, README/SETUP |

## Principios

- La lógica del puzzle (`src/lib/puzzle`) es pura: sin DOM, sin Firebase, sin PixiJS. Se prueba con Vitest.
- La red (`src/lib/firebase`) traduce entre el modelo y la base de datos; envía solo deltas.
- El render (`src/lib/render`) observa el modelo y dibuja con PixiJS; la entrada (puntero/táctil) produce acciones.
- El almacenamiento de imágenes está detrás de `ImageStorage` (`src/lib/storage`).
- Sin claves en el repositorio: todo por variables de entorno (`.env.example`).

## Criterios de aceptación (checklist final)

- [x] Dos navegadores suben una foto propia, entran por enlace a la misma sala y ven los movimientos del otro.
- [x] Versus con cuenta regresiva sincronizada y barra del rival.
- [x] Cerrar y reabrir la sala conserva el progreso.
- [x] Una persona sin el enlace no puede leer la sala ni las fotos.
- [x] Táctil y pellizco en celular.
- [x] Lint, typecheck, pruebas y build sin errores ni advertencias.
