"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LangSwitch } from "@/components/Shell";

const DEMO: [string, string][] = [
  ["iskander@atu.demo", "Столовая «Искандер» — ответственный"],
  ["canella@atu.demo", "Кофейня «Canella» — ответственный"],
  ["reviewer@atu.demo", "Проверяющий"],
  ["admin@atu.demo", "Администратор"],
  ["boss@atu.demo", "Руководство"],
];

function LoginForm() {
  const { t } = useI18n();
  const { profile, loading, refresh } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && profile) router.replace(next); }, [loading, profile, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setErr(t("loginError")); setBusy(false); return; }
    await refresh();
    router.replace(next);
  }

  return (
    <div className="grid min-h-dvh bg-pine md:grid-cols-2">
      <div className="relative hidden overflow-hidden p-12 text-white md:flex md:flex-col md:justify-between">
        <div className="flex items-center gap-3 text-lg font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-10 w-10 rounded-xl" /> ZeroWaste ATU
        </div>
        <div>
          <p className="text-5xl font-bold leading-[1.05] tracking-tight">Отходы.<br />Данные.<br /><span className="text-amber">Решения.</span></p>
          <p className="mt-6 max-w-md text-white/70">{t("appSub")}</p>
        </div>
        <p className="text-[12px] text-white/40">Smart Food Industries · Hackathon ATU 2026 · Track 1</p>
        <svg className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 text-white/5" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="8"><circle cx="50" cy="50" r="40" /></svg>
      </div>
      <div className="flex items-center justify-center bg-cream p-5 md:rounded-l-[2rem]">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-pine md:invisible">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" /> ZeroWaste ATU
            </div>
            <LangSwitch />
          </div>
          <h1 className="h1 mb-1">{t("login")}</h1>
          <p className="mb-5 text-[14px] text-mute">{t("appSub")}</p>
          <label className="label" htmlFor="email">{t("email")}</label>
          <input id="email" className="field mb-3" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="label" htmlFor="pw">{t("password")}</label>
          <input id="pw" className="field mb-4" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="mb-3 rounded-xl bg-clay/10 px-3 py-2 text-[14px] font-medium text-clay">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? t("loading") : t("login")}</button>
          <div className="mt-6 rounded-2xl border border-dashed border-line p-3">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-mute">{t("demoLogins")}</p>
            <div className="flex flex-col gap-1">
              {DEMO.map(([em, label]) => (
                <button type="button" key={em} onClick={() => setEmail(em)} className="rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-mint">
                  <b className="font-semibold text-pine">{label}</b> <span className="text-mute">· {em}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
