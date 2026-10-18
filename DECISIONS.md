# Registro de decisiones

Formato: decisión — motivo — alternativas descartadas.

## Stack

1. **Next.js 16 (App Router) + React 19 + Tailwind 4 + TypeScript 5.** Versión estable actual de
   `create-next-app`. Se mantiene `cacheComponents` + `partialPrefetching` (por defecto en 16.4). Las
   páginas de juego son componentes cliente; el servidor solo sirve el shell y `/api/cleanup`.
   TypeScript 7 (nativo) se descartó: Next 16 aún declara TS 5.
2. **PixiJS v8 (WebGL) en lugar de Konva.** Konva dibuja en Canvas 2D y con 500–1000 nodos en
   movimiento cae de 60 fps en móviles de gama media; Pixi agrupa sprites que comparten textura en
   pocas draw calls. Con un atlas de piezas, 1000 piezas ≈ 3–4 texturas.
3. **Detección de toque propia en vez del EventSystem de Pixi.** Los sprites incluyen el margen de
   las pestañas; el hit-test por rectángulo tomaría la pieza equivocada. Usamos `Path2D` +
   `isPointInPath` sobre ≤9 piezas candidatas por grupo: exacto y barato.
4. **Vitest** para pruebas unitarias; **@firebase/rules-unit-testing** + emulador para las reglas.

## Datos y tiempo real

5. **Grupos como union-find en RTDB (`m` = fusionado en).** Fusionar es una escritura O(1) sin importar
   el tamaño del grupo y es robusto ante fusiones concurrentes. Descartado: guardar `pieceGroup/{i}`
   (reescribir cientos de piezas en cada fusión y huérfanos con carreras).
6. **Coordenadas normalizadas**: ancho del puzzle = 1. Independiente de pantalla y resolución.
7. **El grupo que se suelta se fusiona en el estacionario.** El que suelta posee el bloqueo; las
   reglas permiten fusionar solo si el destino no está bloqueado por otro y no tiene `m` (sin ciclos).
   Si al soltar encaja con varios grupos, los no bloqueados también se fusionan.
8. **Bloqueo con transacción + reglas + caducidad de 15 s + onDisconnect.** La transacción da
   exclusión en el cliente; las reglas la garantizan en el servidor; la caducidad evita piezas
   trabadas si una pestaña se congela sin desconectarse.
9. **Throttling de 40 ms** durante el arrastre e interpolación exponencial (τ ≈ 60 ms) en los demás.
10. **Contador "piezas colocadas"** = piezas que pertenecen a un grupo de 2 o más. "Quién colocó
    más" = número de uniones hechas por cada jugador (`stats/{uid}`).
11. **Encaje con el marco**: además de entre piezas, un grupo sin rotar cerca de su posición final se
    fija ahí (donde aparece la imagen fantasma). Hace útil la opción de fantasma.
12. **Tiempo cooperativo = tiempo jugado acumulado** (no reloj de pared), para que cerrar la sala
    varios días no infle el tiempo. Lo suma un único "cronometrador" (menor uid conectado).

## Salas y seguridad

13. **ID de sala = código**: 12 caracteres base32 Crockford (sin I, L, O, U) ≈ 60 bits, mostrado como
    `ABCD-EFGH-JKMN`. Enlace corto `/r/abcdefghjkmn`. Es a la vez lo bastante corto para dictarlo y
    no adivinable (2⁶⁰ combinaciones, sin listado). El enlace es la invitación: quien lo tiene puede
    unirse mientras haya cupo.
14. **Máximo de jugadores con `slots/{n}`**: las reglas permiten escribir `slots/n` solo si está vacío y
    `n < maxPlayers`, y `members/{uid}` exige que `slots/{slot}` sea suyo. Así RTDB (sin contadores)
    impone el límite. El creador puede expulsar para liberar cupo; un miembro puede salir.
15. **`info` leíble por autenticados** (solo `maxPlayers`, `createdAt`, `createdBy`): permite mostrar
    "sala llena" o "no existe" antes de unirse. No expone fotos, chat ni apodos.
16. **Almacenamiento de imágenes por defecto en RTDB (`NEXT_PUBLIC_IMAGE_STORAGE=rtdb`).**
    Verificado (FAQ oficial de Firebase sobre los cambios anunciados en sept-2024): los buckets nuevos
    exigen el plan Blaze desde oct-2024 y, desde el 3-feb-2026, los proyectos Spark pierden acceso a
    sus buckets `*.appspot.com` (errores 402/403). Es decir, hoy Storage siempre exige Blaze.
    Además, las reglas de Storage no pueden consultar RTDB, así que no pueden comprobar membresía.
    Guardar la imagen comprimida (≈0,3–2 MB) en trozos base64 en RTDB funciona en el plan gratuito
    Spark (1 GB almacenado, 10 GB/mes de descarga), con reglas de membresía reales y sin configurar
    CORS. Cada cliente cachea la imagen en IndexedDB, así que se descarga una vez por dispositivo.
    El adaptador `firebase` (Storage) está implementado y se activa con `NEXT_PUBLIC_IMAGE_STORAGE=firebase`
    (requiere Blaze + CORS; seguridad por capacidad: ruta de 131 bits, `list` prohibido).
    Vercel Blob o Supabase Storage se pueden añadir implementando `ImageStorage` (ver SETUP.md).
17. **Límite práctico de imagen**: máximo 2048 px por lado y 10 MB (regla dura); el compresor apunta a
    ≤ 2,5 MB (WebP 0,86 → JPEG si el navegador no codifica WebP) para no gastar cuota de RTDB.
18. **Limpieza a 60 días con Vercel Cron + firebase-admin** (`/api/cleanup`, protegido con
    `CRON_SECRET`). Cloud Functions programadas requieren Blaze. Usa el índice ligero `/roomIndex` para
    no descargar salas enteras.
19. **Borrado de sala por su creador**: borra imágenes (adaptador), `/images/{roomId}`, la sala y su
    índice. Las reglas solo permiten borrar la sala a `info.createdBy`.
20. **Referrer-Policy: no-referrer** y `noindex` en salas para no filtrar el enlace.

## Versus

21. Se mantienen los valores por defecto pedidos: cada jugador arma su tablero con la misma imagen,
    mismas piezas y **la misma dispersión inicial** (semilla de la ronda) para que la carrera sea justa.
    Cuenta regresiva de 4 s desde `round.at` (marca del servidor) + `serverTimeOffset`. Gana el primero
    que escribe `round.winner` (escritura única validada por reglas). Revancha = ronda `n+1` con nueva semilla.
22. El tablero de cada jugador se persiste en `versus/boards/{uid}` solo al soltar, así reabrir la sala
    continúa la carrera.

## Imagen y piezas

23. **EXIF**: se decodifica con `createImageBitmap(..., {imageOrientation: "from-image"})`; se lee la
    orientación y las dimensiones crudas del JPEG y, si el navegador no rotó (dimensiones sin
    intercambiar en orientaciones 5–8), se rota manualmente.
24. **HEIC**: primero se intenta decodificar de forma nativa (Safari); si falla, `heic2any` se carga
    bajo demanda (import dinámico, no afecta la carga inicial).
25. **Bordes de pieza**: 3 curvas Bézier cúbicas por borde (estilo generador clásico de Draradech) con
    variación aleatoria por semilla; bordes exteriores rectos.
26. **Galería de ejemplo**: ilustraciones SVG propias creadas para el proyecto (sin derechos de
    terceros), incluidas en `public/gallery`. Se rasterizan y suben como una foto más.
27. **Modo solitario 100 % local** (IndexedDB): funciona sin configurar Firebase y conserva la partida.

## UI

28. Interfaz en español; i18n con diccionarios tipados (`src/i18n/es.ts`, `en.ts`) y `useT()`.
    El inglés está traducido y se elige con el selector de idioma.
29. Sonido de encaje sintetizado con WebAudio (sin archivos), desactivable.
30. Estética cálida y sobria: papel crema, tinta marrón, acento terracota, tipografías Fraunces + Nunito Sans.
