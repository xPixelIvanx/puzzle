/** Rutas de la base de datos (una sola fuente de verdad, ver ARCHITECTURE.md). */
export const P = {
  room: (r: string) => `rooms/${r}`,
  info: (r: string) => `rooms/${r}/info`,
  activity: (r: string) => `rooms/${r}/activity`,
  slot: (r: string, n: number) => `rooms/${r}/slots/${n}`,
  members: (r: string) => `rooms/${r}/members`,
  member: (r: string, u: string) => `rooms/${r}/members/${u}`,
  presence: (r: string) => `rooms/${r}/presence`,
  presenceOf: (r: string, u: string) => `rooms/${r}/presence/${u}`,
  cursors: (r: string) => `rooms/${r}/cursors`,
  cursor: (r: string, u: string) => `rooms/${r}/cursors/${u}`,
  roomImages: (r: string) => `rooms/${r}/images`,
  puzzle: (r: string) => `rooms/${r}/puzzle`,
  groups: (r: string) => `rooms/${r}/groups`,
  group: (r: string, g: number) => `rooms/${r}/groups/g${g}`,
  stats: (r: string) => `rooms/${r}/stats`,
  chat: (r: string) => `rooms/${r}/chat`,
  versus: (r: string) => `rooms/${r}/versus`,
  round: (r: string) => `rooms/${r}/versus/round`,
  progress: (r: string) => `rooms/${r}/versus/progress`,
  board: (r: string, u: string) => `rooms/${r}/versus/boards/${u}`,
  imageData: (r: string, i: string) => `images/${r}/${i}`,
  imagesOfRoom: (r: string) => `images/${r}`,
  roomIndex: (r: string) => `roomIndex/${r}`,
};

export const groupKey = (g: number) => `g${g}`;

export function parseGroupKey(k: string): number {
  return k.startsWith("g") ? Number(k.slice(1)) : NaN;
}
