export const MIN_PIECES = 24;
export const MAX_PIECES = 1000;
export const PIECE_TARGETS = [24, 48, 70, 100, 150, 200, 300, 500, 750, 1000] as const;

/** Proporción máxima admitida (alto/ancho o ancho/alto) para que la cuadrícula tenga sentido. */
export const MAX_ASPECT = 4;

export interface GridSize {
  cols: number;
  rows: number;
  count: number;
}

/**
 * Elige columnas × filas para una imagen de proporción `aspect` (= alto / ancho) con un número de
 * piezas cercano a `target`, buscando piezas lo más cuadradas posible y respetando 24..1000.
 */
export function gridFor(aspect: number, target: number): GridSize {
  const a = Math.min(MAX_ASPECT, Math.max(1 / MAX_ASPECT, aspect));
  const goal = Math.min(MAX_PIECES, Math.max(MIN_PIECES, target));
  let best: GridSize | null = null;
  let bestScore = Infinity;
  for (let cols = 2; cols <= 100; cols++) {
    const ideal = cols * a; // filas para piezas cuadradas
    for (const rows of [Math.floor(ideal), Math.ceil(ideal), Math.round(ideal) + 1, Math.round(ideal) - 1]) {
      if (rows < 2) continue;
      const count = cols * rows;
      if (count < MIN_PIECES || count > MAX_PIECES) continue;
      const pieceAspect = (a / rows) * cols; // alto/ancho de cada pieza
      const score = Math.abs(Math.log(pieceAspect)) * 1.5 + Math.abs(count - goal) / goal;
      if (score < bestScore) {
        bestScore = score;
        best = { cols, rows, count };
      }
    }
  }
  // Siempre hay solución en el rango (p. ej. 5×5 = 25), pero por seguridad:
  return best ?? { cols: 6, rows: 4, count: 24 };
}

/** Opciones de número de piezas para una imagen, sin duplicados y ordenadas. */
export function gridOptions(aspect: number): GridSize[] {
  const seen = new Set<number>();
  const out: GridSize[] = [];
  for (const target of PIECE_TARGETS) {
    const g = gridFor(aspect, target);
    if (!seen.has(g.count)) {
      seen.add(g.count);
      out.push(g);
    }
  }
  return out.sort((x, y) => x.count - y.count);
}
