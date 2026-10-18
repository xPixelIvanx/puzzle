/**
 * Pruebas de database.rules.json contra el emulador de Realtime Database.
 * Ejecutar con: npm run test:rules   (levanta el emulador con Firebase CLI; requiere Java)
 */
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const TS = { ".sv": "timestamp" };
const ROOM = "abcdefghjkmn";
const OTHER_ROOM = "0123456789ab";
const IMG = "A".repeat(22);

let env: RulesTestEnvironment;

const db = (uid: string | null) => (uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database());

function newRoom(owner: string, maxPlayers = 2) {
  return {
    info: { createdBy: owner, createdAt: TS, maxPlayers },
    activity: TS,
    slots: { 0: owner },
    members: { [owner]: { name: "Ana", color: "#c2512e", slot: 0, joinedAt: TS } },
  };
}

function join(uid: string, slot: number, room = ROOM) {
  return db(uid)
    .ref()
    .update({
      [`rooms/${room}/slots/${slot}`]: uid,
      [`rooms/${room}/members/${uid}`]: { name: "Beto", color: "#2f7d6d", slot, joinedAt: TS },
    });
}

/** Estado base: sala de ana (máx. 2) con beto como miembro y un puzzle cooperativo de 4 grupos. */
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const now = Date.now();
    await ctx
      .database()
      .ref(`rooms/${ROOM}`)
      .set({
        info: { createdBy: "ana", createdAt: now, maxPlayers: 2 },
        slots: { 0: "ana", 1: "beto" },
        members: {
          ana: { name: "Ana", color: "#c2512e", slot: 0, joinedAt: now },
          beto: { name: "Beto", color: "#2f7d6d", slot: 1, joinedAt: now },
        },
        puzzle: {
          id: "PUZZLE000001",
          mode: "coop",
          image: { id: IMG, storage: "rtdb", w: 1600, h: 1200 },
          cols: 6,
          rows: 4,
          seed: 1,
          rotate: false,
          by: "ana",
          at: now,
        },
        groups: {
          g0: { x: 0, y: 0, r: 0 },
          g1: { x: 0.5, y: 0.5, r: 0 },
          g2: { x: 1, y: 1, r: 0 },
          g3: { x: 1.5, y: 1.5, r: 0 },
        },
        versus: { round: { n: 1, seed: 5, by: "ana" } },
      });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-puzzle-juntos",
    database: { rules: readFileSync("database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
});

describe("salas", () => {
  it("un usuario autenticado crea una sala como primer miembro", async () => {
    await assertSucceeds(db("ana").ref(`rooms/${ROOM}`).set(newRoom("ana")));
  });

  it("sin sesión no se puede crear nada", async () => {
    await assertFails(db(null).ref(`rooms/${ROOM}`).set(newRoom("ana")));
  });

  it("no se puede crear a nombre de otra persona ni con id inválido", async () => {
    await assertFails(db("beto").ref(`rooms/${ROOM}`).set(newRoom("ana")));
    await assertFails(db("ana").ref(`rooms/ABC`).set(newRoom("ana")));
  });

  it("no se puede sobrescribir una sala existente", async () => {
    await seed();
    await assertFails(db("eva").ref(`rooms/${ROOM}`).set(newRoom("eva")));
  });

  it("nadie puede listar salas ni índices", async () => {
    await seed();
    await assertFails(db("ana").ref("rooms").once("value"));
    await assertFails(db("ana").ref("roomIndex").once("value"));
    await assertFails(db("ana").ref("images").once("value"));
  });
});

describe("privacidad: una persona ajena", () => {
  beforeEach(seed);

  it("no lee la sala, el puzzle, los grupos ni el chat", async () => {
    const eva = db("eva");
    await assertFails(eva.ref(`rooms/${ROOM}`).once("value"));
    await assertFails(eva.ref(`rooms/${ROOM}/puzzle`).once("value"));
    await assertFails(eva.ref(`rooms/${ROOM}/groups`).once("value"));
    await assertFails(eva.ref(`rooms/${ROOM}/chat`).once("value"));
    await assertFails(eva.ref(`rooms/${ROOM}/members`).once("value"));
  });

  it("solo puede leer `info` (para saber si existe o está llena) y su propio miembro", async () => {
    await assertSucceeds(db("eva").ref(`rooms/${ROOM}/info`).once("value"));
    await assertSucceeds(db("eva").ref(`rooms/${ROOM}/members/eva`).once("value"));
    await assertFails(db(null).ref(`rooms/${ROOM}/info`).once("value"));
  });

  it("no puede escribir en la sala", async () => {
    await assertFails(db("eva").ref(`rooms/${ROOM}/chat/x`).set({ u: "eva", n: "Eva", c: "#000000", t: "hola", at: TS }));
    await assertFails(db("eva").ref(`rooms/${ROOM}/groups/g0/x`).set(3));
    await assertFails(db("eva").ref(`rooms/${ROOM}/puzzle/done`).set(TS));
  });

  it("no lee las fotos de la sala", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref(`images/${ROOM}/${IMG}`).set({ meta: { by: "ana", mime: "image/webp", bytes: 3, n: 1, at: 1 }, c: { 0: "AAAA" } }),
    );
    await assertFails(db("eva").ref(`images/${ROOM}/${IMG}`).once("value"));
    await assertSucceeds(db("beto").ref(`images/${ROOM}/${IMG}`).once("value"));
  });

  it("un miembro de una sala no lee otra sala", async () => {
    await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(`rooms/${OTHER_ROOM}`).set({ info: { createdBy: "zoe", createdAt: 1, maxPlayers: 2 }, members: { zoe: { name: "Zoe", color: "#000000", slot: 0, joinedAt: 1 } } }));
    await assertFails(db("ana").ref(`rooms/${OTHER_ROOM}/members`).once("value"));
  });
});

describe("unirse y máximo de jugadores", () => {
  beforeEach(async () => {
    await assertSucceeds(db("ana").ref(`rooms/${ROOM}`).set(newRoom("ana", 2)));
  });

  it("ocupa un hueco libre y pasa a leer la sala", async () => {
    await assertSucceeds(join("beto", 1));
    await assertSucceeds(db("beto").ref(`rooms/${ROOM}`).once("value"));
  });

  it("no puede ocupar un hueco ocupado", async () => {
    await assertFails(join("beto", 0));
  });

  it("no puede pasar de maxPlayers", async () => {
    await assertSucceeds(join("beto", 1));
    await assertFails(join("carla", 2));
    await assertFails(join("carla", 1));
  });

  it("no puede ocupar un hueco sin registrarse como miembro (ni al revés)", async () => {
    await assertFails(db("beto").ref(`rooms/${ROOM}/slots/1`).set("beto"));
    await assertFails(
      db("beto").ref(`rooms/${ROOM}/members/beto`).set({ name: "Beto", color: "#2f7d6d", slot: 1, joinedAt: TS }),
    );
  });

  it("valida y limpia apodos", async () => {
    await assertFails(
      db("beto")
        .ref()
        .update({
          [`rooms/${ROOM}/slots/1`]: "beto",
          [`rooms/${ROOM}/members/beto`]: { name: "<script>", color: "#2f7d6d", slot: 1, joinedAt: TS },
        }),
    );
  });

  it("el anfitrión puede expulsar y liberar el hueco; un miembro no puede expulsar a otro", async () => {
    await assertSucceeds(join("beto", 1));
    await assertFails(db("beto").ref().update({ [`rooms/${ROOM}/members/ana`]: null, [`rooms/${ROOM}/slots/0`]: null }));
    await assertSucceeds(db("ana").ref().update({ [`rooms/${ROOM}/members/beto`]: null, [`rooms/${ROOM}/slots/1`]: null }));
    await assertSucceeds(join("carla", 1));
  });
});

describe("bloqueo de piezas (cooperativo)", () => {
  beforeEach(seed);
  const g = (uid: string, k = "g0") => db(uid).ref(`rooms/${ROOM}/groups/${k}`);

  it("quien bloquea un grupo es el único que puede moverlo", async () => {
    await assertSucceeds(g("ana").update({ l: { u: "ana", t: TS } }));
    await assertSucceeds(g("ana").update({ x: 0.3, y: 0.2 }));
    await assertFails(g("beto").update({ x: 0.9 }));
    await assertFails(g("beto").update({ l: { u: "beto", t: TS } }));
    await assertFails(g("beto").child("l").remove());
  });

  it("la transacción de bloqueo solo la gana uno", async () => {
    const lock = (uid: string) =>
      g(uid).transaction((cur: { l?: { u: string } } | null) => {
        if (cur === null) return null; // sin caché local: el servidor responde con el valor real
        if (cur.l && cur.l.u !== uid) return undefined;
        return { ...cur, l: { u: uid, t: TS } };
      });
    const owner = async (uid: string) => {
      const res = await lock(uid);
      return res.committed && res.snapshot.child("l/u").val() === uid;
    };
    const [a, b] = await Promise.all([owner("ana"), owner("beto")]);
    if (a === b) throw new Error("ambos o ninguno obtuvieron el bloqueo");
  });

  it("no se puede bloquear a nombre de otro", async () => {
    await assertFails(g("beto").update({ l: { u: "ana", t: TS } }));
  });

  it("al soltar se libera y el otro jugador puede tomarlo", async () => {
    await assertSucceeds(g("ana").update({ l: { u: "ana", t: TS } }));
    await assertSucceeds(g("ana").update({ x: 0.1, y: 0.1, r: 0, l: null }));
    await assertSucceeds(g("beto").update({ l: { u: "beto", t: TS } }));
  });

  it("un bloqueo abandonado (más de 15 s sin refrescar) se puede tomar", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref(`rooms/${ROOM}/groups/g0/l`).set({ u: "ana", t: Date.now() - 60_000 }),
    );
    await assertSucceeds(g("beto").update({ l: { u: "beto", t: TS } }));
  });

  it("valida posiciones y rotación", async () => {
    await assertFails(g("ana").update({ r: 5 }));
    await assertFails(g("ana").update({ x: "a" }));
    await assertFails(g("ana").update({ z: 1 }));
  });
});

describe("fusión de grupos", () => {
  beforeEach(seed);
  const g = (uid: string, k: string) => db(uid).ref(`rooms/${ROOM}/groups/${k}`);

  it("fusiona un grupo en otro libre", async () => {
    await assertSucceeds(g("ana", "g1").set({ m: "g0" }));
  });

  it("no fusiona en un grupo bloqueado por otra persona", async () => {
    await assertSucceeds(g("beto", "g0").update({ l: { u: "beto", t: TS } }));
    await assertFails(g("ana", "g1").set({ m: "g0" }));
  });

  it("no permite ciclos ni apuntar a grupos fusionados o inexistentes", async () => {
    await assertSucceeds(g("ana", "g1").set({ m: "g0" }));
    await assertFails(g("ana", "g0").set({ m: "g1" }));
    await assertFails(g("ana", "g2").set({ m: "g1" }));
    await assertFails(g("ana", "g2").set({ m: "g99" }));
    await assertFails(g("ana", "g2").set({ m: "g2" }));
  });

  it("un grupo fusionado ya no se puede mover", async () => {
    await assertSucceeds(g("ana", "g1").set({ m: "g0" }));
    await assertFails(g("beto", "g1").update({ x: 3 }));
  });

  it("solo se reinician los grupos al cambiar de puzzle", async () => {
    await assertFails(db("ana").ref(`rooms/${ROOM}/groups`).set(null));
    await assertSucceeds(
      db("ana")
        .ref()
        .update({
          [`rooms/${ROOM}/puzzle/id`]: "PUZZLE000002",
          [`rooms/${ROOM}/groups`]: { g0: { x: 0, y: 0, r: 0 } },
          [`rooms/${ROOM}/stats`]: null,
        }),
    );
  });

  it("cada quien suma solo sus propias uniones", async () => {
    await assertSucceeds(db("ana").ref(`rooms/${ROOM}/stats/ana`).set(3));
    await assertFails(db("ana").ref(`rooms/${ROOM}/stats/beto`).set(3));
  });
});

describe("chat", () => {
  beforeEach(seed);
  const msg = (uid: string, t: string, u = uid) =>
    Promise.resolve(db(uid).ref(`rooms/${ROOM}/chat`).push({ u, n: "Ana", c: "#c2512e", t, at: TS }));

  it("un miembro envía mensajes válidos", async () => {
    await assertSucceeds(msg("ana", "hola <3"));
  });

  it("rechaza suplantación, mensajes vacíos o demasiado largos", async () => {
    await assertFails(msg("ana", "hola", "beto"));
    await assertFails(msg("ana", ""));
    await assertFails(msg("ana", "x".repeat(501)));
  });

  it("los mensajes no se editan", async () => {
    await assertSucceeds(db("ana").ref(`rooms/${ROOM}/chat/m1`).set({ u: "ana", n: "Ana", c: "#c2512e", t: "hola", at: TS }));
    await assertFails(db("ana").ref(`rooms/${ROOM}/chat/m1/t`).set("adiós"));
  });
});

describe("imágenes en RTDB", () => {
  beforeEach(seed);
  const base = `images/${ROOM}/${IMG}`;

  it("un miembro sube metadatos y trozos; otro miembro no puede añadir trozos", async () => {
    await assertSucceeds(db("ana").ref(`${base}/meta`).set({ by: "ana", mime: "image/webp", bytes: 1000, n: 2, at: TS }));
    await assertSucceeds(db("ana").ref(`${base}/c/0`).set("AAAA"));
    await assertFails(db("beto").ref(`${base}/c/1`).set("BBBB"));
    await assertFails(db("ana").ref(`${base}/c/0`).set("CCCC"));
  });

  it("rechaza tipos y tamaños no permitidos", async () => {
    await assertFails(db("ana").ref(`${base}/meta`).set({ by: "ana", mime: "image/svg+xml", bytes: 1000, n: 1, at: TS }));
    await assertFails(db("ana").ref(`${base}/meta`).set({ by: "ana", mime: "image/jpeg", bytes: 11 * 1024 * 1024, n: 1, at: TS }));
    await assertSucceeds(db("ana").ref(`${base}/meta`).set({ by: "ana", mime: "image/jpeg", bytes: 10, n: 1, at: TS }));
    await assertFails(db("ana").ref(`${base}/c/0`).set("x".repeat(524289)));
  });

  it("una persona ajena no puede subir a la sala", async () => {
    await assertFails(db("eva").ref(`${base}/meta`).set({ by: "eva", mime: "image/webp", bytes: 1000, n: 1, at: TS }));
  });
});

describe("borrar la sala", () => {
  beforeEach(seed);

  it("solo el creador puede borrarla (con sus fotos e índice)", async () => {
    await assertFails(db("beto").ref(`rooms/${ROOM}`).remove());
    await assertFails(db("beto").ref(`images/${ROOM}`).remove());
    await assertSucceeds(db("ana").ref(`images/${ROOM}`).remove());
    await assertSucceeds(db("ana").ref(`roomIndex/${ROOM}`).remove());
    await assertSucceeds(db("ana").ref(`rooms/${ROOM}`).remove());
  });
});

describe("versus", () => {
  beforeEach(seed);
  const v = (uid: string) => db(uid).ref(`rooms/${ROOM}/versus`);

  it("cada quien escribe solo su progreso y su tablero", async () => {
    await assertSucceeds(v("ana").child("progress/ana").set({ n: 1, joined: 3, moves: 4 }));
    await assertFails(v("ana").child("progress/beto").set({ n: 1, joined: 3, moves: 4 }));
    await assertSucceeds(v("ana").child("boards/ana").set({ n: 1, g: { g0: { x: 1, y: 1, r: 0 }, g1: { m: "g0" } } }));
    await assertFails(v("beto").child("boards/ana/g/g0/x").set(2));
  });

  it("empezar la carrera usa la hora del servidor", async () => {
    await assertSucceeds(v("beto").child("round/at").set(TS));
    await assertFails(v("beto").child("round/at").set(123));
  });

  it("solo gana quien terminó, y una sola vez", async () => {
    await assertFails(v("ana").child("round/winner").set("ana"));
    await assertSucceeds(v("ana").child("progress/ana").set({ n: 1, joined: 23, moves: 30, done: TS }));
    await assertFails(v("ana").child("round/winner").set("beto"));
    await assertSucceeds(v("ana").child("round/winner").set("ana"));
    await assertSucceeds(v("beto").child("progress/beto").set({ n: 1, joined: 23, moves: 31, done: TS }));
    await assertFails(v("beto").child("round/winner").set("beto"));
  });

  it("la revancha solo avanza la ronda de uno en uno", async () => {
    await assertSucceeds(v("beto").child("round").set({ n: 2, seed: 9, by: "beto", at: TS }));
    await assertFails(v("beto").child("round").set({ n: 5, seed: 9, by: "beto", at: TS }));
  });
});

describe("puzzle", () => {
  beforeEach(seed);
  it("valida el número de piezas", async () => {
    await assertFails(db("ana").ref(`rooms/${ROOM}/puzzle`).update({ cols: 50, rows: 30 }));
    await assertFails(db("ana").ref(`rooms/${ROOM}/puzzle`).update({ cols: 4, rows: 4 }));
    await assertFails(db("ana").ref(`rooms/${ROOM}/puzzle/cols`).set(1));
    await assertSucceeds(db("ana").ref(`rooms/${ROOM}/puzzle`).update({ cols: 40, rows: 25 }));
  });
  it("cualquier miembro suma tiempo o marca el final", async () => {
    await assertSucceeds(db("beto").ref(`rooms/${ROOM}/puzzle/elapsed`).set(10000));
    await assertSucceeds(db("beto").ref(`rooms/${ROOM}/puzzle/done`).set(TS));
  });
});
