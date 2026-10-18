/** Bloqueo de un grupo en el modo cooperativo: quién lo tiene y cuándo lo refrescó (ms del servidor). */
export interface Lock {
  u: string;
  t: number;
}

/** Un bloqueo sin refrescar durante este tiempo se considera abandonado. Debe coincidir con las reglas. */
export const LOCK_TTL_MS = 15_000;
/** Cada cuánto refresca su bloqueo quien arrastra. */
export const LOCK_HEARTBEAT_MS = 4_000;

export function isLockActive(lock: Lock | null | undefined, now: number): lock is Lock {
  return !!lock && typeof lock.u === "string" && typeof lock.t === "number" && lock.t > now - LOCK_TTL_MS;
}

/** ¿Lo tiene otra persona con un bloqueo vigente? */
export function isLockedByOther(lock: Lock | null | undefined, uid: string, now: number): boolean {
  return isLockActive(lock, now) && lock.u !== uid;
}

export interface LockableGroup {
  l?: Lock | null;
  m?: unknown;
  [key: string]: unknown;
}

/**
 * Función de actualización para `runTransaction` sobre `groups/{g}`.
 * Devuelve el nuevo valor (con el bloqueo para `uid`) o `undefined` para abortar.
 * `stamp` es el valor a guardar en `t` (normalmente serverTimestamp()).
 */
export function acquireLockUpdate<T extends LockableGroup>(
  current: T | null,
  uid: string,
  now: number,
  stamp: unknown,
): (T & { l: unknown }) | undefined {
  if (!current) return undefined; // el grupo no existe (o aún no está en caché)
  if (current.m !== undefined && current.m !== null) return undefined; // ya fusionado: hay que tomar la raíz
  if (isLockedByOther(current.l, uid, now)) return undefined;
  return { ...current, l: { u: uid, t: stamp } };
}

/** ¿Puede `uid` escribir la posición de este grupo? (espejo de la regla de la base de datos) */
export function canWriteGroup(group: LockableGroup | null, uid: string, now: number): boolean {
  if (!group) return false;
  if (group.m !== undefined && group.m !== null) return false;
  return !isLockedByOther(group.l, uid, now);
}
