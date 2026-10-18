import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-soft hover:bg-accent-strong active:translate-y-px disabled:bg-ink-mute/60",
  secondary: "bg-card text-ink border border-line hover:border-ink-mute hover:bg-white active:translate-y-px",
  ghost: "text-ink-soft hover:bg-paper-2 hover:text-ink",
  danger: "bg-danger text-white hover:brightness-110 active:translate-y-px",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Botón redondo de las barras flotantes del tablero. Siempre con etiqueta accesible. */
export function ToolButton({
  label,
  active = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={rest["aria-pressed"] ?? (active ? true : undefined)}
      className={`relative grid size-11 shrink-0 place-items-center rounded-full transition hover:bg-white/15 active:scale-95 ${
        active ? "bg-white/20 text-[#ffd9b8]" : "text-[#fbf4ea]"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
