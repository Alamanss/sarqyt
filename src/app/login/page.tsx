"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LangSwitch, Logo, Wordmark } from "@/components/Shell";

// Демо-пароль общий и открытый (он же в README): по клику на демо-вход поля заполняются сами
const DEMO_PASSWORD = "Atu2026demo";
const DEMO: [string, string, string][] = [
  ["iskander@atu.demo", "Столовая «Искандер»", "Ответственное лицо"],
  ["canella@atu.demo", "Кофейня «Canella»", "Ответственное лицо"],
  ["reviewer@atu.demo", "Гульнара Касымова", "Проверяющий"],
  ["admin@atu.demo", "Администратор", "Управление системой"],
  ["boss@atu.demo", "Руководство АТУ", "Только просмотр"],
];

function LoginForm() {
  const { t, lang } = useI18n();
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
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,480px)_1fr]">
      <div className="flex flex-col bg-paper px-6 py-6 sm:px-12 lg:border-r lg:border-line">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5"><Logo /><Wordmark className="text-[22px]" /></span>
          <LangSwitch />
        </div>
        <form onSubmit={submit} className="my-auto w-full max-w-[360px] py-10">
          <h1 className="h1">{lang === "kk" ? "Жүйеге кіру" : "Вход в систему"}</h1>
          <p className="mt-1.5 mb-7 text-[14px] text-mute">{t("appSub")}</p>
          <label className="label" htmlFor="email">{t("email")}</label>
          <input id="email" className="field mb-4" type="email" autoComplete="username" placeholder="name@atu.edu.kz" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="label" htmlFor="pw">{t("password")}</label>
          <input id="pw" className="field mb-6" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="note note-err mb-4" role="alert">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? t("loading") : t("login")}{!busy && <ArrowRight className="h-4 w-4" />}</button>

          <div className="mt-8">
            <p className="eyebrow mb-2">{t("demoLogins")}</p>
            <div className="overflow-hidden rounded-lg border border-line">
              {DEMO.map(([em, name, role], i) => (
                <button type="button" key={em} onClick={() => { setEmail(em); setPassword(DEMO_PASSWORD); }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-wash ${i ? "border-t border-line" : ""} ${email === em ? "bg-brandtint" : ""}`}>
                  <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{name}</span><span className="block truncate text-[12px] text-mute">{role}</span></span>
                  <span className="shrink-0 font-mono text-[12px] text-faint">{em}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
        <p className="text-[12px] text-faint">Smart Food Industries · Hackathon ATU 2026 · Track 1</p>
      </div>

      <div className="relative hidden overflow-hidden bg-cream lg:block">
        <div className="relative flex h-full flex-col justify-center px-16">
          <p className="eyebrow mb-3">{lang === "kk" ? "Толық цикл" : "Полный цикл учёта"}</p>
          <p className="max-w-lg text-[32px] font-semibold leading-10 tracking-[-0.02em]">
            {lang === "kk" ? "Таразыдан есепке дейін — қағазсыз." : "От взвешивания до отчёта — без бумажных таблиц."}
          </p>
          <ol className="mt-10 grid max-w-lg gap-0">
            {(lang === "kk"
              ? [["Енгізу", "Смартфоннан 30 секундта: тізімнен таңдау, фото немесе дауыс"], ["Тексеру", "Қабылдау немесе пікірмен қайтару, өзгерістер тарихы"], ["Тізілім", "Қабылданған деректер бірыңғай тізілімге түседі"], ["Аналитика", "Динамика, CO₂-эквивалент, үнемдеу әлеуеті, Excel есебі"]]
              : [["Ввод", "Со смартфона за 30 секунд: выбор из списка, фото или голос"], ["Проверка", "Принять или вернуть с комментарием, история изменений"], ["Реестр", "Принятые данные автоматически сводятся в единый реестр"], ["Аналитика", "Динамика, CO₂-эквивалент, потенциал экономии, отчёт в Excel"]]
            ).map(([h, p], i, a) => (
              <li key={h} className="flex gap-4">
                <span className="flex flex-col items-center">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-line bg-paper text-[12px] font-semibold text-brand">{i + 1}</span>
                  {i < a.length - 1 && <span className="w-px flex-1 bg-line" />}
                </span>
                <span className="pb-6"><span className="block text-[15px] font-semibold">{h}</span><span className="block text-[14px] text-mute">{p}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
