"use client";

import { useId } from "react";
import { useT } from "@/i18n";
import { NAME_MAX, PLAYER_COLORS } from "@/lib/sanitize";

export interface Profile {
  name: string;
  color: string;
}

export function ProfileFields({
  value,
  onChange,
  error,
  taken = [],
}: {
  value: Profile;
  onChange: (p: Profile) => void;
  error?: string | null;
  taken?: string[];
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${id}-name`} className="mb-1.5 block text-sm font-semibold text-ink-soft">
          {t("profile.name")}
        </label>
        <input
          id={`${id}-name`}
          value={value.name}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          placeholder={t("profile.namePlaceholder")}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className="h-12 w-full rounded-2xl border border-line bg-white px-4 text-base outline-none transition placeholder:text-ink-mute/70 focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        {error && (
          <p id={`${id}-err`} className="mt-1.5 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink-soft">{t("profile.color")}</legend>
        <div className="flex flex-wrap gap-2.5">
          {PLAYER_COLORS.map((c, i) => {
            const selected = value.color === c;
            return (
              <label key={c} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={`${id}-color`}
                  value={c}
                  checked={selected}
                  onChange={() => onChange({ ...value, color: c })}
                  className="peer sr-only"
                  aria-label={t("profile.colorName", { n: i + 1 })}
                />
                <span
                  className={`block size-9 rounded-full border-2 border-white shadow-soft transition peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                    selected ? "scale-110 ring-2 ring-ink" : "hover:scale-105"
                  } ${taken.includes(c) && !selected ? "opacity-40" : ""}`}
                  style={{ background: c }}
                />
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
