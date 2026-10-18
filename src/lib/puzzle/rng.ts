/** PRNG determinista (mulberry32). Devuelve números en [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash FNV-1a de 32 bits, útil para derivar semillas de cadenas. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Base32 Crockford en minúsculas (sin i, l, o, u): fácil de dictar y sin ambigüedades. */
export const ROOM_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const ROOM_ID_LENGTH = 12; // 12 × 5 bits = 60 bits

export function newRoomId(): string {
  // 256 es múltiplo de 32 → sin sesgo.
  return Array.from(randomBytes(ROOM_ID_LENGTH), (b) => ROOM_ALPHABET[b & 31]).join("");
}

export function isValidRoomId(id: string): boolean {
  return new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_ID_LENGTH}}$`).test(id);
}

/** "abcdefghjkmn" → "ABCD-EFGH-JKMN" */
export function formatRoomCode(id: string): string {
  return id.toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
}

/**
 * Normaliza lo que la persona escribe o pega (código o enlace completo) a un roomId.
 * Aplica las equivalencias de Crockford: I/L → 1, O → 0.
 */
export function parseRoomCode(input: string): string | null {
  let s = input.trim();
  const fromUrl = s.match(/\/r\/([^/?#\s]+)/i);
  if (fromUrl) s = fromUrl[1];
  s = s
    .toLowerCase()
    .replace(/[\s-]/g, "")
    .replace(/[il]/g, "1")
    .replace(/o/g, "0");
  return isValidRoomId(s) ? s : null;
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Identificador base62 sin sesgo (rechazo de bytes ≥ 248). 22 caracteres ≈ 131 bits. */
export function newSecureId(length = 22): string {
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < 248 && out.length < length) out += BASE62[b % 62];
    }
  }
  return out;
}

export function randomSeed(): number {
  const b = randomBytes(4);
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
}
