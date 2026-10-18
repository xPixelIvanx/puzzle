# Arquitectura

## Capas

```
src/
├─ app/                 Rutas Next.js (App Router): /, /solo, /r/[roomId], /api/cleanup
├─ components/          UI React (tablero, barra de herramientas, chat, diálogos)
├─ i18n/                Diccionarios (es, en) y proveedor useT()
└─ lib/
   ├─ puzzle/           LÓGICA PURA (sin DOM ni red) — probada con Vitest
   │   ├─ rng.ts          PRNG con semilla (mulberry32) e IDs aleatorios
   │   ├─ grid.ts         Elegir columnas×filas según proporción y nº de piezas
   │   ├─ shapes.ts       Bordes Bézier (pestañas/muescas) y contorno de cada pieza
   │   ├─ geometry.ts     Rotaciones de 90°, transformaciones de grupo
   │   ├─ board.ts        Modelo del tablero: grupos (union-find), snapping, fusión, victoria
   │   ├─ layout.ts       Dispersión inicial determinista y "ordenar piezas sueltas"
   │   └─ locks.ts        Decisiones de bloqueo (usadas dentro de la transacción)
   ├─ image/            Decodificar (HEIC), EXIF, recorte, redimensionar y comprimir
   ├─ render/           PixiJS: atlas de piezas, escena, cámara, entrada táctil/ratón, sonido
   ├─ firebase/         Cliente, auth anónima, salas, presencia, coop, versus, chat
   ├─ storage/          Interfaz ImageStorage + adaptadores (RTDB, Firebase Storage) + caché IndexedDB
   └─ game/             Controladores de sesión (solo, coop, versus) que unen modelo ↔ red ↔ render
```

Flujo de una acción de arrastre:

```
puntero ─► input.ts ─► GameController.grab(g)
                         ├─ coop: transacción de bloqueo en RTDB (rechazada si otro la tiene)
                         └─ modelo local (optimista) ─► renderer
movimiento ─► controller.move(g, x, y) ─► modelo ─► renderer
                                        └─ red: update {x,y} con throttling de 40 ms
soltar ─► controller.drop(g) ─► board.findSnaps() ─► fusiones (m) + liberar bloqueo (1 update multi-ruta)
remoto ─► onChildChanged(groups/g) ─► modelo ─► renderer (interpolación exponencial)
```

## Modelo geométrico

- Marco del puzzle: ancho = **1**, alto = `aspect = alto/ancho` de la imagen. Todas las coordenadas
  guardadas están en estas unidades normalizadas (nunca en píxeles de pantalla).
- Pieza `i = fila*cols + col` ocupa `[col/cols, (col+1)/cols] × [fila*ph, (fila+1)*ph]`.
- Un **grupo** tiene una transformación rígida `T = (x, y, r)`: `mundo = R(r·90°)·p + (x, y)`, donde `p`
  es la posición correcta de un punto en el marco del puzzle. Todas las piezas de un grupo comparten T.
- Dos grupos vecinos encajan si tienen la misma `r` y `|t_A − t_B| < tolerancia` (≈30 % del lado de
  pieza). Basta comparar traslaciones: no hay que recalcular piezas.
- Encajar con el marco: un grupo con `r = 0` y `|t| < tolerancia` se coloca en `t = (0,0)` (posición final,
  donde se dibuja la imagen fantasma).
- Victoria: queda un único grupo raíz.

### Grupos como union-find en la base de datos

Al inicio el grupo `gN` contiene solo la pieza `N`. Fusionar A en B **no reescribe piezas**: se escribe
`groups/gA = { m: "gB" }` (puntero de fusión). La raíz de una pieza se obtiene siguiendo `m`.
Ventajas: fusión O(1) en datos (un solo write aunque el grupo tenga 500 piezas) y tolerante a
concurrencia: si B se fusiona después en C, A queda transitivamente en C. Las reglas impiden ciclos
(el destino no puede tener `m`) y fusionar grupos bloqueados por otra persona.

## Esquema de Realtime Database

```
/rooms/{roomId}                          roomId: 12 caracteres base32 Crockford (60 bits, no adivinable)
  info        { createdBy, createdAt, maxPlayers }      leíble por cualquier usuario autenticado que conozca el id
  activity    ts                                         última actividad (throttled, 5 min)
  slots/{n}   uid                                        n < maxPlayers; asegura el máximo de jugadores
  members/{uid}   { name, color, slot, joinedAt }
  presence/{uid}  { on: bool, at: ts }                   onDisconnect → on:false
  cursors/{uid}   { x, y }                               coords normalizadas; onDisconnect → remove
  images/{imageId} { storage: "rtdb"|"firebase", by, at } inventario para borrar la sala
  puzzle      { id, mode: "coop"|"versus", image: { id, storage, w, h },
                cols, rows, seed, rotate, by, at, elapsed, done? }
  groups/{gN} { x, y, r, l?: { u, t }, m? }              COOP. l = bloqueo (uid, ts servidor); m = fusionado en
  stats/{uid} number                                     COOP. uniones hechas por cada jugador
  chat/{pushId} { u, n, c, t, at }                       uid, apodo, color, texto (≤500), ts servidor
  versus
    round       { n, seed, at, by, winner? }              at = ts servidor de creación; inicio = at + 4 s
    progress/{uid} { n, joined, moves, done? }            barra del rival (solo números)
    boards/{uid}   { n, g: { gN: { x, y, r, m? } } }      tablero propio persistido (solo lo escribe su dueño)

/images/{roomId}/{imageId}               adaptador "rtdb" (por defecto)
  meta   { by, mime, bytes, n, at }
  c/{i}  string base64 (≤ 512 KiB por trozo, ≤ 32 trozos)

/roomIndex/{roomId}  ts                  última actividad; solo lo lee el servidor (limpieza a 60 días)
```

Firebase Storage (adaptador "firebase", opcional): `rooms/{roomId}/{imageId}` con metadatos
`owner` y `roomOwner`. `imageId` = 22 caracteres base62 (~131 bits).

### Deltas, no estado completo

- Arrastre: `update(groups/gN, {x, y})` cada 40 ms como máximo (≈25 Hz) + latido `l/t` cada 4 s.
- Soltar: una sola escritura multi-ruta con la posición final, fusiones (`m`) y liberación del bloqueo.
- Los clientes escuchan `onChildAdded/Changed/Removed` sobre `groups`, nunca `onValue` del nodo entero.
- Versus: el tablero propio se escribe solo al soltar (no durante el arrastre).

### Bloqueos (cooperativo)

1. Tomar: `runTransaction(groups/gN)` → aborta si `m` existe o si `l` es de otro y está fresco
   (`t > ahoraServidor − 15 s`). Lógica pura en `locks.ts`.
2. `onDisconnect(groups/gN/l).remove()` al tomarlo; `cancel()` al soltar.
3. Reglas: nadie puede escribir un grupo bloqueado por otro con bloqueo fresco.
4. Bloqueos huérfanos (pestaña congelada) caducan a los 15 s; el dueño refresca `l/t` mientras arrastra.

### Presencia y reconexión

- `.info/connected` → al (re)conectar se registran `onDisconnect` de presencia y cursor y se vuelve a
  marcar `on: true`. El SDK reintenta y reenvía escrituras pendientes.
- `.info/serverTimeOffset` → reloj del servidor para cuenta regresiva y caducidad de bloqueos.
- Si se cae la conexión durante un arrastre, se suelta el grupo localmente.

### Tiempo

- Coop: `puzzle.elapsed` acumula ms jugados. El miembro conectado con uid menor suma cada 10 s con
  `increment()`; los demás interpolan.
- Versus: `inicio = round.at + 4000`; tiempo = `progress.done − inicio` (ambos del servidor).

## Seguridad

- `/rooms` y `/images` no se pueden listar. Solo los miembros (`members/{auth.uid}` existe) leen la sala.
- Unirse requiere conocer el `roomId` (el enlace es la invitación) y ocupar un `slot` libre.
- Imágenes RTDB: leíbles solo por miembros de la sala; tamaño/tipo validados; escritura única.
- Firebase Storage no puede consultar RTDB desde sus reglas, así que allí la seguridad es por
  capacidad: ruta con `roomId` + `imageId` de 131 bits que solo conocen los miembros, `list` prohibido,
  autenticación obligatoria, tamaño ≤ 10 MB y `image/*`. Ver DECISIONS.md.
- `Referrer-Policy: no-referrer` para que el enlace de la sala no se filtre a otros sitios.
- Apodos y chat: se recortan, se eliminan caracteres de control y `<>`; React escapa al renderizar
  (nunca `dangerouslySetInnerHTML`); las reglas limitan longitudes.

## Render (PixiJS v8)

- Atlas: cada pieza se recorta en un canvas 2D con su `Path2D` (clip + drawImage + bisel) y se empaqueta
  en páginas de 2048×2048 → pocas texturas, buen batching (1000 sprites ≈ pocas draw calls).
- Un `Container` por grupo con su transformación; los sprites de piezas son hijos en su posición correcta.
- Detección de toque propia (sin el sistema de eventos de Pixi): punto → marco del grupo → celda →
  `isPointInPath` sobre las ≤9 piezas candidatas.
- Bucle `requestAnimationFrame` que renderiza solo si hay cambios o animaciones (ahorra batería).
- Interpolación exponencial de grupos y cursores remotos.
