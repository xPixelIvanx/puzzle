/** Rotación en cuartos de vuelta, en sentido horario (ejes de pantalla: y hacia abajo). */
export type Rot = 0 | 1 | 2 | 3;

export interface Vec {
  x: number;
  y: number;
}

/** Transformación rígida de un grupo: mundo = R(r)·p + (x, y). */
export interface Transform {
  x: number;
  y: number;
  r: Rot;
}

export function normRot(r: number): Rot {
  return (((Math.round(r) % 4) + 4) % 4) as Rot;
}

export function rotateVec(p: Vec, r: Rot): Vec {
  switch (r) {
    case 0:
      return { x: p.x, y: p.y };
    case 1:
      return { x: -p.y, y: p.x };
    case 2:
      return { x: -p.x, y: -p.y };
    case 3:
      return { x: p.y, y: -p.x };
  }
}

export function toWorld(t: Transform, p: Vec): Vec {
  const q = rotateVec(p, t.r);
  return { x: q.x + t.x, y: q.y + t.y };
}

export function toLocal(t: Transform, w: Vec): Vec {
  return rotateVec({ x: w.x - t.x, y: w.y - t.y }, normRot(4 - t.r));
}

/** Cambia la rotación de un grupo manteniendo fijo el punto del mundo `pivot`. */
export function rotateAbout(t: Transform, r: Rot, pivot: Vec): Transform {
  const q = toLocal(t, pivot);
  const rq = rotateVec(q, r);
  return { x: pivot.x - rq.x, y: pivot.y - rq.y, r };
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
