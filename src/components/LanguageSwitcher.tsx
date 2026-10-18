"use client";

import { LOCALE_NAMES, LOCALES, useI18n, type Locale } from "@/i18n";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-ink-soft ${className}`}>
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink"
      >
        {(Object.keys(LOCALES) as Locale[]).map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
