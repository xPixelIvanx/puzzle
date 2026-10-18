import Link from "next/link";
import type { ReactNode } from "react";

export function HeaderLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="glass grid size-11 shrink-0 place-items-center rounded-full shadow-float transition hover:bg-[#2a1e18]"
    >
      {children}
    </Link>
  );
}

export function HeaderButton({
  label,
  onClick,
  children,
  badge,
  expanded,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  badge?: number;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      onClick={onClick}
      className="glass relative grid size-11 shrink-0 place-items-center rounded-full shadow-float transition hover:bg-[#2a1e18]"
    >
      {children}
      {!!badge && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}
