#!/usr/bin/env node
/**
 * Genera database.rules.json a partir de expresiones con nombre (más legible y sin duplicar).
 * Uso: npm run rules:build   — el JSON resultante se versiona y se despliega con Firebase CLI.
 * Esquema documentado en ARCHITECTURE.md.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const room = "root.child('rooms/' + $roomId)";
const AUTH = "auth != null";
const MEMBER = `(${AUTH} && ${room}.child('members/' + auth.uid).exists())`;
const CREATOR = `(${AUTH} && ${room}.child('info/createdBy').val() === auth.uid)`;
const LOCK_TTL = 15000; // = LOCK_TTL_MS en src/lib/puzzle/locks.ts
const MAX_PIECES = 1000;

const ROOM_ID = "/^[0-9a-hjkmnp-tv-z]{12}$/";
const SECURE_ID = "/^[0-9A-Za-z]{22}$/";
const COLOR = "/^#[0-9a-fA-F]{6}$/";
const GROUP_KEY = "/^g[0-9]{1,4}$/";

const num = (min, max) => `newData.isNumber() && newData.val() >= ${min} && newData.val() <= ${max}`;
const int = (min, max) => `${num(min, max)} && newData.val() % 1 === 0`;
const str = (min, max) => `newData.isString() && newData.val().length >= ${min} && newData.val().length <= ${max}`;
const isNow = "newData.isNumber() && newData.val() === now";
const notFuture = "newData.isNumber() && newData.val() <= now";
const NO_OTHER = { $other: { ".validate": false } };

/** El hueco $n debe ser menor que maxPlayers (RTDB no convierte cadenas a número). */
const maxPlayers = "newData.parent().parent().child('info/maxPlayers').val()";
const slotInRange = `(${Array.from({ length: 8 }, (_, i) => `($n === '${i}' && ${maxPlayers} >= ${i + 1})`).join(" || ")})`;

/** El grupo destino de una fusión: existe, no está fusionado y no lo bloquea otra persona. */
const target = "newData.parent().parent().child(newData.val())";
const mergeTarget = [
  "newData.isString()",
  "newData.val() !== $g",
  `newData.val().matches(${GROUP_KEY})`,
  `${target}.exists()`,
  `!${target}.child('m').exists()`,
  `(!${target}.child('l').exists() || ${target}.child('l/u').val() === auth.uid || ${target}.child('l/t').val() < now - ${LOCK_TTL})`,
].join(" && ");

const groupFields = {
  x: { ".validate": num(-1000, 1000) },
  y: { ".validate": num(-1000, 1000) },
  r: { ".validate": "newData.isNumber() && (newData.val() === 0 || newData.val() === 1 || newData.val() === 2 || newData.val() === 3)" },
};

/** Reinicio de una sección cuando cambia el puzzle (en la misma escritura). */
const PUZZLE_CHANGES = "newData.parent().child('puzzle/id').val() !== data.parent().child('puzzle/id').val()";

const rules = {
  rules: {
    ".read": false,
    ".write": false,
    rooms: {
      $roomId: {
        ".read": MEMBER,
        // Crear (con su creador como primer miembro) o borrar (solo el creador).
        ".write": [
          `(${AUTH} && !data.exists() && $roomId.matches(${ROOM_ID}) && newData.child('info/createdBy').val() === auth.uid && newData.child('slots/0').val() === auth.uid && newData.child('members/' + auth.uid + '/slot').val() === 0)`,
          `(${AUTH} && data.exists() && !newData.exists() && data.child('info/createdBy').val() === auth.uid)`,
        ].join(" || "),
        info: {
          ".read": AUTH,
          ".validate": "newData.hasChildren(['createdBy', 'createdAt', 'maxPlayers'])",
          createdBy: { ".validate": "newData.isString() && newData.val() === auth.uid" },
          createdAt: { ".validate": isNow },
          maxPlayers: { ".validate": int(2, 8) },
          ...NO_OTHER,
        },
        activity: { ".write": MEMBER, ".validate": isNow },
        slots: {
          $n: {
            ".write": [
              `(${AUTH} && !data.exists() && newData.val() === auth.uid && ${room}.child('info').exists() && !${room}.child('members/' + auth.uid).exists() && newData.parent().parent().child('members/' + auth.uid).exists())`,
              `(${AUTH} && !newData.exists() && (data.val() === auth.uid || ${room}.child('info/createdBy').val() === auth.uid))`,
            ].join(" || "),
            ".validate": `newData.isString() && ${slotInRange}`,
          },
        },
        members: {
          $uid: {
            ".read": `${AUTH} && auth.uid === $uid`,
            ".write": [
              `(${AUTH} && auth.uid === $uid && newData.exists() && newData.parent().parent().child('slots/' + newData.child('slot').val()).val() === auth.uid && (!data.exists() || data.child('slot').val() === newData.child('slot').val()))`,
              `(${AUTH} && !newData.exists() && (auth.uid === $uid || ${room}.child('info/createdBy').val() === auth.uid))`,
            ].join(" || "),
            ".validate": "newData.hasChildren(['name', 'color', 'slot', 'joinedAt'])",
            name: { ".validate": `${str(1, 24)} && !newData.val().matches(/[<>]/)` },
            color: { ".validate": `newData.isString() && newData.val().matches(${COLOR})` },
            slot: { ".validate": int(0, 7) },
            joinedAt: { ".validate": notFuture },
            ...NO_OTHER,
          },
        },
        presence: {
          $uid: {
            ".write": `(${MEMBER} && auth.uid === $uid) || (!newData.exists() && ${CREATOR})`,
            ".validate": "newData.hasChildren(['on', 'at'])",
            on: { ".validate": "newData.isBoolean()" },
            at: { ".validate": notFuture },
            ...NO_OTHER,
          },
        },
        cursors: {
          $uid: {
            ".write": `(${MEMBER} && auth.uid === $uid) || (!newData.exists() && ${CREATOR})`,
            ".validate": "newData.hasChildren(['x', 'y'])",
            x: { ".validate": num(-1000, 1000) },
            y: { ".validate": num(-1000, 1000) },
            ...NO_OTHER,
          },
        },
        images: {
          $imageId: {
            ".write": `(${MEMBER} && !data.exists()) || (${AUTH} && !newData.exists() && (data.child('by').val() === auth.uid || ${room}.child('info/createdBy').val() === auth.uid))`,
            ".validate": `$imageId.matches(${SECURE_ID}) && newData.hasChildren(['storage', 'by', 'at'])`,
            storage: { ".validate": "newData.val() === 'rtdb' || newData.val() === 'firebase'" },
            by: { ".validate": "newData.val() === auth.uid" },
            at: { ".validate": isNow },
            ...NO_OTHER,
          },
        },
        puzzle: {
          ".write": MEMBER,
          ".validate": `newData.hasChildren(['id', 'mode', 'image', 'cols', 'rows', 'seed', 'rotate', 'by', 'at']) && newData.child('cols').val() * newData.child('rows').val() >= 24 && newData.child('cols').val() * newData.child('rows').val() <= ${MAX_PIECES}`,
          id: { ".validate": `newData.isString() && newData.val().matches(/^[0-9A-Za-z]{12}$/)` },
          mode: { ".validate": "newData.val() === 'coop' || newData.val() === 'versus'" },
          image: {
            ".validate": "newData.hasChildren(['id', 'storage', 'w', 'h'])",
            id: { ".validate": `newData.isString() && newData.val().matches(${SECURE_ID})` },
            storage: { ".validate": "newData.val() === 'rtdb' || newData.val() === 'firebase'" },
            w: { ".validate": int(16, 4096) },
            h: { ".validate": int(16, 4096) },
            ...NO_OTHER,
          },
          cols: { ".validate": int(2, 100) },
          rows: { ".validate": int(2, 100) },
          seed: { ".validate": int(0, 4294967295) },
          rotate: { ".validate": "newData.isBoolean()" },
          by: { ".validate": "newData.val() === auth.uid" },
          at: { ".validate": isNow },
          elapsed: { ".validate": num(0, 1e12) },
          done: { ".validate": notFuture },
          ...NO_OTHER,
        },
        groups: {
          ".write": `${MEMBER} && ${PUZZLE_CHANGES}`,
          $g: {
            // Nadie escribe un grupo fusionado ni uno bloqueado (con bloqueo vigente) por otra persona.
            ".write": `${MEMBER} && !data.child('m').exists() && (!data.child('l').exists() || data.child('l/u').val() === auth.uid || data.child('l/t').val() < now - ${LOCK_TTL})`,
            ".validate": `$g.matches(${GROUP_KEY}) && (newData.hasChildren(['x', 'y', 'r']) || newData.hasChildren(['m']))`,
            ...groupFields,
            l: {
              ".validate": "newData.hasChildren(['u', 't'])",
              u: { ".validate": "newData.val() === auth.uid" },
              t: { ".validate": notFuture },
              ...NO_OTHER,
            },
            m: { ".validate": mergeTarget },
            ...NO_OTHER,
          },
        },
        stats: {
          ".write": `${MEMBER} && ${PUZZLE_CHANGES}`,
          $uid: {
            ".write": `${MEMBER} && auth.uid === $uid`,
            ".validate": int(0, MAX_PIECES),
          },
        },
        chat: {
          $msg: {
            ".write": `${MEMBER} && !data.exists() && newData.exists()`,
            ".validate": "newData.hasChildren(['u', 'n', 'c', 't', 'at'])",
            u: { ".validate": "newData.val() === auth.uid" },
            n: { ".validate": str(1, 24) },
            c: { ".validate": `newData.isString() && newData.val().matches(${COLOR})` },
            t: { ".validate": str(1, 500) },
            at: { ".validate": isNow },
            ...NO_OTHER,
          },
        },
        versus: {
          ".write": `${MEMBER} && ${PUZZLE_CHANGES}`,
          round: {
            ".write": MEMBER,
            ".validate": "newData.hasChildren(['n', 'seed', 'by'])",
            n: { ".validate": `${int(1, 1e9)} && (!data.exists() || newData.val() === data.val() || newData.val() === data.val() + 1)` },
            seed: { ".validate": int(0, 4294967295) },
            by: { ".validate": "newData.isString()" },
            at: { ".validate": isNow },
            winner: {
              ".validate": "!data.exists() && newData.val() === auth.uid && newData.parent().parent().child('progress/' + auth.uid + '/done').exists() && newData.parent().parent().child('progress/' + auth.uid + '/n').val() === newData.parent().child('n').val()",
            },
            ...NO_OTHER,
          },
          progress: {
            $uid: {
              ".write": `${MEMBER} && auth.uid === $uid`,
              ".validate": "newData.hasChildren(['n', 'joined', 'moves'])",
              n: { ".validate": int(1, 1e9) },
              joined: { ".validate": int(0, MAX_PIECES) },
              moves: { ".validate": int(0, 1e7) },
              done: { ".validate": notFuture },
              ...NO_OTHER,
            },
          },
          boards: {
            $uid: {
              ".write": `${MEMBER} && auth.uid === $uid`,
              ".validate": "newData.hasChildren(['n'])",
              n: { ".validate": int(1, 1e9) },
              g: {
                $g: {
                  ".validate": `$g.matches(${GROUP_KEY}) && (newData.hasChildren(['x', 'y', 'r']) || newData.hasChildren(['m']))`,
                  ...groupFields,
                  m: { ".validate": `newData.isString() && newData.val().matches(${GROUP_KEY})` },
                  ...NO_OTHER,
                },
              },
              ...NO_OTHER,
            },
          },
          ...NO_OTHER,
        },
        ...NO_OTHER,
      },
    },
    // Imágenes (adaptador "rtdb"): solo los miembros de la sala las leen.
    images: {
      $roomId: {
        ".write": `${AUTH} && !newData.exists() && ${room}.child('info/createdBy').val() === auth.uid`,
        $imageId: {
          ".read": MEMBER,
          ".write": `${AUTH} && !newData.exists() && (data.child('meta/by').val() === auth.uid || ${room}.child('info/createdBy').val() === auth.uid)`,
          meta: {
            ".write": `${MEMBER} && !data.exists()`,
            ".validate": `$imageId.matches(${SECURE_ID}) && newData.hasChildren(['by', 'mime', 'bytes', 'n', 'at'])`,
            by: { ".validate": "newData.val() === auth.uid" },
            mime: { ".validate": "newData.val() === 'image/jpeg' || newData.val() === 'image/png' || newData.val() === 'image/webp'" },
            bytes: { ".validate": int(1, 10 * 1024 * 1024) },
            n: { ".validate": int(1, 32) },
            at: { ".validate": isNow },
            ...NO_OTHER,
          },
          c: {
            $i: {
              ".write": `${MEMBER} && !data.exists() && data.parent().parent().child('meta/by').val() === auth.uid`,
              ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 524288 && $i.matches(/^([0-9]|[12][0-9]|3[01])$/)",
            },
          },
          ...NO_OTHER,
        },
      },
    },
    // Índice de actividad para la limpieza (solo lo lee el servidor con la cuenta de servicio).
    roomIndex: {
      ".indexOn": ".value",
      $roomId: {
        ".write": `(${MEMBER}) || (!newData.exists() && ${CREATOR})`,
        ".validate": isNow,
      },
    },
  },
};

const out = fileURLToPath(new URL("../database.rules.json", import.meta.url));
writeFileSync(out, JSON.stringify(rules, null, 2) + "\n");
console.log("database.rules.json generado");
