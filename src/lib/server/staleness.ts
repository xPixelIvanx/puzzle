export const INACTIVE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Marca de tiempo antes de la cual una sala se considera abandonada. */
export function staleCutoff(now: number, days = INACTIVE_DAYS): number {
  return now - days * DAY_MS;
}

export function isStale(lastActivity: unknown, now: number, days = INACTIVE_DAYS): boolean {
  return typeof lastActivity !== "number" || lastActivity < staleCutoff(now, days);
}

/** Comparación en tiempo constante del secreto del cron. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
