"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Capa de celebración: confeti en canvas (respeta reduced-motion) y una tarjeta con resultados. */
export function Celebration({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
    };
    resize();
    const colors = ["#ffd9b8", "#a94b2a", "#f6efe5", "#5f7356", "#e8a33d", "#c2512e"];
    const parts = Array.from({ length: 140 }, () => ({
      x: Math.random() * c.width,
      y: -Math.random() * c.height * 0.6,
      vx: (Math.random() - 0.5) * 1.2 * dpr,
      vy: (1.5 + Math.random() * 2.5) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      w: (6 + Math.random() * 6) * dpr,
      h: (3 + Math.random() * 4) * dpr,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      const fade = Math.max(0, 1 - (now - start) / 6000);
      ctx.globalAlpha = fade;
      for (const p of parts) {
        p.x += p.vx + Math.sin((now / 600 + p.r) * 2) * 0.4;
        p.y += p.vy;
        p.r += p.vr;
        if (p.y > c.height + 20) {
          p.y = -20;
          p.x = Math.random() * c.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (fade > 0) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center p-4">
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <section
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="relative w-[min(92vw,26rem)] animate-pop rounded-3xl border border-line bg-card p-6 text-center text-ink shadow-float"
      >
        <h2 className="mb-4 font-display text-3xl font-semibold">{title}</h2>
        <div className="space-y-3">{children}</div>
        {actions && <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">{actions}</div>}
      </section>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-2xl bg-paper px-4 py-3">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="font-display text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}
