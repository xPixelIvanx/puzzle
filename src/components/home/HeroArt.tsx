import { createPuzzleDef, outlineOf, type Outline } from "@/lib/puzzle";

const W = 480;
const H = 360;
const def = createPuzzleDef({ cols: 4, rows: 3, aspect: H / W, seed: 2024, rotate: false });

function d(o: Outline): string {
  const s = W;
  let out = `M${(o.start.x * s).toFixed(1)},${(o.start.y * s).toFixed(1)}`;
  for (const c of o.cmds) {
    out +=
      c.t === "L"
        ? `L${(c.x * s).toFixed(1)},${(c.y * s).toFixed(1)}`
        : `C${(c.x1 * s).toFixed(1)},${(c.y1 * s).toFixed(1)} ${(c.x2 * s).toFixed(1)},${(c.y2 * s).toFixed(1)} ${(c.x * s).toFixed(1)},${(c.y * s).toFixed(1)}`;
  }
  return out + "Z";
}

/** Piezas que "flotan" fuera de su sitio en la ilustración. */
const loose: Record<number, { dx: number; dy: number; rot: number }> = {
  6: { dx: 70, dy: 62, rot: 8 },
  11: { dx: 46, dy: 70, rot: -6 },
  3: { dx: 64, dy: -34, rot: 5 },
};

/** Ilustración del inicio, hecha con la misma lógica de piezas que el juego. */
export function HeroArt() {
  const paths = def.pieces.map((p) => d(outlineOf(def, p.index)));
  return (
    <div className="relative mx-auto w-full max-w-lg animate-fade-up [animation-delay:120ms]" aria-hidden>
      <svg viewBox={`-30 -50 ${W + 140} ${H + 150}`} className="w-full drop-shadow-[0_18px_30px_rgba(42,33,28,0.25)]">
        <defs>
          {paths.map((p, i) => (
            <clipPath id={`hero-${i}`} key={i}>
              <path d={p} />
            </clipPath>
          ))}
        </defs>
        <rect x="-6" y="-6" width={W + 12} height={H + 12} rx="10" fill="#e6d9c7" />
        {def.pieces.map((p, i) => {
          const l = loose[i];
          if (l) {
            return (
              <path key={`hole-${i}`} d={paths[i]} fill="#d5c5af" stroke="#c4b199" strokeDasharray="4 4" strokeWidth="1.5" />
            );
          }
          return (
            <g key={i}>
              <image href="/gallery/sunset.svg" width={W} height={H} clipPath={`url(#hero-${i})`} preserveAspectRatio="xMidYMid slice" />
              <path d={paths[i]} fill="none" stroke="rgba(30,18,10,0.35)" strokeWidth="1.2" />
            </g>
          );
        })}
        {Object.entries(loose).map(([k, l]) => {
          const i = Number(k);
          const p = def.pieces[i];
          const cx = p.cx * W;
          const cy = p.cy * W;
          return (
            <g key={`loose-${i}`} transform={`translate(${l.dx} ${l.dy}) rotate(${l.rot} ${cx} ${cy})`}>
              <path d={paths[i]} fill="rgba(20,10,5,0.25)" transform="translate(5 8)" />
              <image href="/gallery/sunset.svg" width={W} height={H} clipPath={`url(#hero-${i})`} preserveAspectRatio="xMidYMid slice" />
              <path d={paths[i]} fill="none" stroke="rgba(30,18,10,0.4)" strokeWidth="1.2" />
            </g>
          );
        })}
        <Cursor x={300} y={330} color="#2f7d6d" name="Leo" />
        <Cursor x={470} y={20} color="#c2512e" name="Ana" />
      </svg>
    </div>
  );
}

function Cursor({ x, y, color, name }: { x: number; y: number; color: string; name: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(1.6)`}>
      <path d="M0,0 L0,18 L4.5,14 L8,21 L11,19.5 L7.5,12.8 L13,12.5 Z" fill={color} stroke="#fff" strokeWidth="1.5" />
      <rect x="10" y="14" width={name.length * 8 + 14} height="18" rx="9" fill={color} />
      <text x="17" y="27" fontSize="11" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
        {name}
      </text>
    </g>
  );
}
