"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { useT } from "@/i18n";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { usePref } from "@/lib/prefs";
import { parseRoomCode } from "@/lib/puzzle/rng";
import { cleanName, PLAYER_COLORS } from "@/lib/sanitize";
import { idbGet } from "@/lib/storage/localDb";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { ProfileFields, type Profile } from "../ProfileFields";
import { Button } from "../ui/Button";
import { IconPuzzle } from "../ui/icons";
import { HeroArt } from "./HeroArt";

export function HomeClient() {
  const t = useT();
  const router = useRouter();
  const id = useId();
  const [profile, setProfile] = usePref<Profile>("profile", { name: "", color: PLAYER_COLORS[0] });
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [hasSolo, setHasSolo] = useState(false);

  useEffect(() => {
    void idbGet("solo").then((s) => setHasSolo(!!s));
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const name = cleanName(profile.name);
    if (!name) {
      setNameError(t("profile.nameRequired"));
      return;
    }
    setNameError(null);
    setCreating(true);
    setCreateError(null);
    try {
      const { createRoom } = await import("@/lib/firebase/rooms");
      const roomId = await createRoom({ name, color: profile.color }, maxPlayers);
      setProfile({ name, color: profile.color });
      router.push(`/r/${roomId}`);
    } catch (err) {
      console.error(err);
      setCreateError(t("room.error"));
      setCreating(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const roomId = parseRoomCode(code);
    if (!roomId) {
      setCodeError(t("home.joinInvalid"));
      return;
    }
    router.push(`/r/${roomId}`);
  };

  return (
    <div className="paper-grain min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-white shadow-soft">
            <IconPuzzle width={20} height={20} />
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight">{t("app.name")}</span>
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
        <section className="grid items-center gap-8 py-6 md:grid-cols-[1.1fr_1fr] md:py-10">
          <div className="animate-fade-up">
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
              {t("app.tagline")}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft text-pretty">{t("app.description")}</p>
            <ul className="mt-6 grid gap-2 text-[15px] text-ink-soft sm:grid-cols-2">
              {(["photos", "coop", "versus", "resume"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />
                  {t(`home.features.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <HeroArt />
        </section>

        {!isFirebaseConfigured && (
          <p role="note" className="mb-6 rounded-2xl border border-line bg-accent-soft/60 px-4 py-3 text-sm font-semibold text-accent-strong">
            {t("home.noFirebase")}
          </p>
        )}

        <section className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <form
            onSubmit={create}
            aria-labelledby={`${id}-create`}
            className="rounded-[2rem] border border-line bg-card p-6 shadow-soft sm:p-8"
          >
            <h2 id={`${id}-create`} className="font-display text-3xl font-semibold">
              {t("home.createTitle")}
            </h2>
            <p className="mb-6 mt-1 text-ink-soft">{t("home.createBody")}</p>
            <ProfileFields value={profile} onChange={setProfile} error={nameError} />
            <div className="mt-4">
              <label htmlFor={`${id}-max`} className="mb-1.5 block text-sm font-semibold text-ink-soft">
                {t("home.maxPlayers")}
              </label>
              <select
                id={`${id}-max`}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="h-12 rounded-2xl border border-line bg-white px-4"
              >
                {[2, 3, 4, 5, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="mt-6 w-full sm:w-auto" disabled={creating || !isFirebaseConfigured}>
              {creating ? t("common.loading") : t("home.createCta")}
            </Button>
            {createError && (
              <p role="alert" className="mt-3 text-sm font-semibold text-danger">
                {createError}
              </p>
            )}
          </form>

          <div className="grid gap-5">
            <form onSubmit={join} aria-labelledby={`${id}-join`} className="rounded-[2rem] border border-line bg-card p-6 shadow-soft">
              <h2 id={`${id}-join`} className="font-display text-2xl font-semibold">
                {t("home.joinTitle")}
              </h2>
              <p className="mb-4 mt-1 text-ink-soft">{t("home.joinBody")}</p>
              <div className="flex gap-2">
                <label htmlFor={`${id}-code`} className="sr-only">
                  {t("room.code")}
                </label>
                <input
                  id={`${id}-code`}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeError(null);
                  }}
                  placeholder={t("home.joinPlaceholder")}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={!!codeError}
                  className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 font-mono tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-mute/60"
                />
                <Button type="submit" variant="secondary" disabled={!isFirebaseConfigured}>
                  {t("home.joinCta")}
                </Button>
              </div>
              {codeError && (
                <p role="alert" className="mt-2 text-sm font-semibold text-danger">
                  {codeError}
                </p>
              )}
            </form>

            <div className="rounded-[2rem] border border-line bg-sage-soft/70 p-6">
              <h2 className="font-display text-2xl font-semibold">{t("home.soloTitle")}</h2>
              <p className="mb-4 mt-1 text-ink-soft">{t("home.soloBody")}</p>
              <Link
                href="/solo"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-sage px-5 font-semibold text-white shadow-soft transition hover:brightness-110"
              >
                {hasSolo ? t("home.soloContinue") : t("home.soloCta")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-sm text-ink-mute sm:px-8">{t("footer.privacy")}</footer>
    </div>
  );
}
