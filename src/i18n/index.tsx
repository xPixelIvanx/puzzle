"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { es, type Dict, type TKey } from "./es";

export type { TKey, Dict } from "./es";

export const LOCALES = { es, en } satisfies Record<string, Dict>;
export type Locale = keyof typeof LOCALES;
export const LOCALE_NAMES: Record<Locale, string> = { es: "Español", en: "English" };

type Params = Record<string, string | number>;

function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TKey, params?: Params) => string;
}

const Ctx = createContext<I18n>({
  locale: "es",
  setLocale: () => {},
  t: (key, params) => format(es[key], params),
});

const STORAGE_KEY = "encajamos.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("es");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
    const initial = saved && saved in LOCALES ? (saved as Locale) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada, solo en el cliente
    if (initial && initial !== "es") setLocaleState(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignorar */
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = LOCALES[locale];
    return { locale, setLocale, t: (key, params) => format(dict[key] ?? es[key], params) };
  }, [locale, setLocale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}

export function useT() {
  return useContext(Ctx).t;
}
