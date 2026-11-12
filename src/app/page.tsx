"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, Camera, Carrot, Check, ClipboardCheck, Coffee, FileSpreadsheet, History, Leaf, Lock, Mic, Package, PenLine, Scale, SendHorizontal, ShieldCheck, Table2, Utensils } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LangSwitch, Logo, Wordmark } from "@/components/Shell";

/** Число набегает от нуля, когда блок попадает в экран */
function Count({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => { const k = Math.min(1, (t - t0) / 900); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref} className="num">{v}{suffix}</span>;
}

/** Блок плавно поднимается при появлении в экране */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`transition-all duration-700 ease-out ${on ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

/** Метка-курсор участника, как на общей доске */
function Tag({ label, bg, fg = "#16192c", className = "" }: { label: string; bg: string; fg?: string; className?: string }) {
  return (
    <span className={`floaty pointer-events-none absolute z-10 flex items-start ${className}`} aria-hidden="true">
      <svg width="16" height="18" viewBox="0 0 16 18"><path d="M1.5 1.5 14 8l-5.6 1.7L6 15.5z" fill={bg} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
      <span className="-ml-0.5 mt-3 rounded-full px-2.5 py-1 text-[12px] leading-4 font-semibold whitespace-nowrap shadow-[0_6px_14px_-8px_rgba(22,25,44,.4)]" style={{ background: bg, color: fg }}>{label}</span>
    </span>
  );
}
const TILES = ["bg-[#fff3b8]", "bg-[#dff7f1]", "bg-[#e5dfff]", "bg-brandtint"];

// Живой макет экрана ввода: сам проходит цикл «выбрал вид → ввёл вес → сохранил»
const DEMO = [
  { icon: Carrot, ru: "Очистки овощей", kk: "Көкөніс қабықтары", w: "4,2" },
  { icon: Utensils, ru: "Пищевые отходы из зала", kk: "Залдан шыққан қалдық", w: "7,5" },
  { icon: Coffee, ru: "Кофейный жмых", kk: "Кофе сығындысы", w: "2,8" },
  { icon: Package, ru: "Картонная тара", kk: "Картон ыдыс", w: "1,6" },
];
function PhoneDemo({ kk }: { kk: boolean }) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState(0); // 0 выбрано · 1 вес введён · 2 сохранено
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPhase(1); return; }
    const id = setInterval(() => setPhase((p) => { if (p === 2) { setI((x) => (x + 1) % DEMO.length); return 0; } return p + 1; }), 1100);
    return () => clearInterval(id);
  }, []);
  const total = (12.4 + i * 3.1 + (phase === 2 ? Number(DEMO[i].w.replace(",", ".")) : 0)).toFixed(1).replace(".", ",");
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[32px] border border-line bg-paper p-3 shadow-[0_24px_60px_-20px_rgba(22,25,44,.25)]" aria-hidden="true">
      <div className="rounded-[22px] border border-line bg-cream p-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-semibold">{kk ? "Жаңа жазба" : "Новая запись"}</span>
          <span className="num text-[12px] text-mute">{kk ? "бүгін" : "сегодня"} · {total} кг</span>
        </div>
        <div className="grid gap-1.5">
          {DEMO.map((d, k) => {
            const on = k === i;
            return (
              <div key={d.ru} className={`flex h-10 items-center gap-2.5 rounded-lg border bg-paper px-2 transition-all duration-300 ${on ? "border-brand ring-1 ring-brand" : "border-line"}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-md transition-colors duration-300 ${on ? "bg-brand text-white" : "bg-wash text-mute"}`}><d.icon className="h-4 w-4" strokeWidth={1.8} /></span>
                <span className={`truncate text-[12px] ${on ? "font-semibold" : ""}`}>{kk ? d.kk : d.ru}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex h-14 items-center justify-between rounded-lg border border-line bg-paper px-3">
          <span className={`num text-[26px] font-semibold tracking-[-0.02em] transition-colors duration-300 ${phase === 0 ? "text-[#c9cfda]" : "text-ink"}`}>{phase === 0 ? "0,0" : DEMO[i].w}</span>
          <span className="text-[12px] text-faint">кг</span>
        </div>
        <div className={`mt-2 flex h-10 items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold text-white transition-colors duration-300 ${phase === 2 ? "bg-leaf" : "bg-brand"}`}>
          {phase === 2 ? <><Check className="h-4 w-4" strokeWidth={2.6} />{kk ? "Сақталды" : "Сохранено"}</> : (kk ? "Жазбаны сақтау" : "Сохранить запись")}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { loading, profile } = useAuth();
  const { lang } = useI18n();
  const router = useRouter();
  const kk = lang === "kk";

  // вошедшего пользователя сразу ведём в его раздел
  useEffect(() => {
    if (loading || !profile) return;
    router.replace(profile.role === "responsible" ? "/entry" : profile.role === "reviewer" ? "/reports" : profile.role === "admin" ? "/admin" : "/dashboard");
  }, [loading, profile, router]);

  if (loading || profile) return <div className="grid min-h-dvh place-items-center" role="status"><span className="animate-pulse"><Logo size={40} /></span></div>;

  const steps = kk
    ? [[PenLine, "Енгізу", "Жауапты адам смартфоннан үш түртумен салмақты жазады"], [ClipboardCheck, "Тексеру", "Тексеруші есепті қабылдайды немесе пікірмен қайтарады"], [Table2, "Тізілім", "Қабылданған деректер бірыңғай тізілімге өзі түседі"], [BarChart3, "Аналитика", "Динамика, CO₂, ауытқулар және тоқсандық Excel есебі"]] as const
    : [[PenLine, "Ввод", "Ответственный записывает вес со смартфона в три касания"], [ClipboardCheck, "Проверка", "Проверяющий принимает отчёт или возвращает с комментарием"], [Table2, "Реестр", "Принятые данные сами попадают в единый реестр"], [BarChart3, "Аналитика", "Динамика, CO₂, отклонения и квартальный отчёт в Excel"]] as const;
  const ways = kk
    ? [[PenLine, "Форма", "тізімнен таңдау"], [Camera, "Фото", "ЖИ түрін анықтайды"], [Mic, "Дауыс", "«үш кило қабық»"], [SendHorizontal, "Telegram", "ботқа хабарлама"], [Scale, "Таразы", "электронды таразы API"], [FileSpreadsheet, "Excel, бланк", "импорт және OCR"]] as const
    : [[PenLine, "Форма", "выбор из списка"], [Camera, "Фото", "ИИ определяет вид"], [Mic, "Голос", "«три кило очистков»"], [SendHorizontal, "Telegram", "сообщение боту"], [Scale, "Весы", "API электронных весов"], [FileSpreadsheet, "Excel, бланк", "импорт и OCR"]] as const;
  const trust = kk
    ? [[ShieldCheck, "Құқықтар серверде", "Жауапты адам тек өз ұйымының деректерін көреді — бұл дерекқор деңгейінде шектелген"], [Lock, "Қабылданған есеп құлыпталады", "Тексерушінің шешімінен кейін жазбаларды өзгерту мүмкін емес"], [History, "Әр қадам тарихта", "Кім, қашан, не істеді және қандай пікір қалдырды — бәрі сақталады"]] as const
    : [[ShieldCheck, "Права на сервере", "Ответственный видит только свою организацию — это ограничено на уровне базы данных"], [Lock, "Принятый отчёт блокируется", "После решения проверяющего записи изменить нельзя"], [History, "Каждый шаг в истории", "Кто, когда, что сделал и какой комментарий оставил — всё сохраняется"]] as const;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 md:px-7">
          <span className="flex items-center gap-2.5"><Logo size={32} /><Wordmark className="text-[24px]" /></span>
          <span className="ml-auto" />
          <LangSwitch />
          <Link href="/login" className="btn-primary !min-h-10 !px-4">{kk ? "Кіру" : "Войти"}</Link>
        </div>
      </header>

      <main>
        {/* первый экран: продукт + снятое опасение, в подзаголовке цифры */}
        <div className="relative overflow-x-clip">
        <div className="board pointer-events-none absolute inset-0" aria-hidden="true" />
        <section className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-4 pt-12 pb-20 md:px-7 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="hero-in">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-[14px] text-mute"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-leaf" /></span>Smart Food Industries · {kk ? "АТУ хакатоны, 1-трек" : "хакатон АТУ, Трек 1"}</p>
            <h1 className="max-w-[640px] text-[36px] leading-[1.1] font-semibold tracking-[-0.03em] md:text-[56px]">
              {kk ? <>Тамақ қалдықтарының есебі — <span className="marker">қағаз кестесіз</span></> : <>Учёт пищевых отходов — <span className="marker">без бумажных таблиц</span></>}
            </h1>
            <p className="mt-5 max-w-[540px] text-[18px] leading-7 text-mute">
              {kk ? "Смартфоннан жазба — 10 секунд, тоқсандық есеп — бір батырма. Кампустың бес ұйымы бір тізілімде." : "Запись со смартфона за 10 секунд, отчёт за квартал одной кнопкой. Пять организаций кампуса в одном реестре."}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/login" className="btn-primary !min-h-12 !px-6 !text-[16px]">{kk ? "Жүйеге кіру" : "Войти в систему"}<ArrowRight className="h-4 w-4" /></Link>
              <a href="#how" className="link">{kk ? "Бұл қалай жұмыс істейді" : "Как это работает"}</a>
            </div>
            <dl className="mt-12 grid max-w-[540px] grid-cols-4 gap-4 border-t border-line pt-6">
              {([[3, kk ? "түрту — бір жазба" : "касания на запись"], [6, kk ? "енгізу тәсілі" : "способов ввода"], [5, kk ? "АТУ ұйымы" : "организаций АТУ"], [2, kk ? "тіл: қаз, рус" : "языка: қаз, рус"]] as const).map(([n, label]) => (
                <div key={label}><dt className="text-[32px] leading-none font-semibold tracking-[-0.03em]"><Count to={n} /></dt><dd className="mt-2 text-[12px] leading-4 text-mute sm:text-[14px] sm:leading-5">{label}</dd></div>
              ))}
            </dl>
          </div>
          <div className="hero-in [animation-delay:150ms]">
            <div className="relative mx-auto w-full max-w-[300px]">
              <PhoneDemo kk={kk} />
              <Tag label={kk ? "Асхана" : "Столовая"} bg="#ffd9ec" className="-left-3 top-8 sm:-left-24 sm:top-12" />
              <Tag label={kk ? "Тексеруші" : "Проверяющий"} bg="#2f55e6" fg="#fff" className="-right-3 top-[58%] [animation-delay:1.4s] sm:-right-24" />
              <span className="sticker floaty absolute -bottom-8 -left-1 z-10 w-[150px] px-3 py-3 text-center [--r:-5deg] [animation-delay:.7s] sm:-left-12" aria-hidden="true">{kk ? "3 түрту — жазба дайын" : "3 касания — и запись готова"}</span>
            </div>
          </div>
        </section>

        </div>

        {/* как это работает */}
        <section id="how" className="scroll-mt-16 border-y border-line bg-cream">
          <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-7 md:py-24">
            <Reveal><h2 className="max-w-[560px] text-[28px] leading-9 font-semibold tracking-[-0.02em] md:text-[36px] md:leading-[44px]">{kk ? "Таразыдан есепке дейін — төрт қадам" : "От весов до отчёта — четыре шага"}</h2></Reveal>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map(([Icon, h, p], i) => (
                <Reveal key={h} delay={i * 90}>
                  <li className="lift h-full rounded-xl border border-line bg-paper p-6">
                    <div className="mb-6 flex items-center justify-between"><span className={`grid h-10 w-10 place-items-center rounded-lg text-ink ${TILES[i]}`}><Icon className="h-5 w-5" strokeWidth={1.9} /></span><span className="num text-[14px] text-faint">0{i + 1}</span></div>
                    <h3 className="text-[18px] leading-6 font-semibold">{h}</h3>
                    <p className="mt-2 text-[14px] leading-5 text-mute">{p}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* шесть способов ввода */}
        <section className="mx-auto max-w-[1200px] px-4 py-16 md:px-7 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <Reveal>
              <h2 className="text-[28px] leading-9 font-semibold tracking-[-0.02em] md:text-[36px] md:leading-[44px]">{kk ? "Жазбаны алты тәсілмен енгізуге болады" : "Шесть способов внести запись"}</h2>
              <p className="mt-4 max-w-[420px] text-[16px] leading-6 text-mute">{kk ? "Жауапты адам өзіне ыңғайлысын таңдайды, ал тексеруші әр жазбаның қайдан келгенін көреді." : "Ответственный выбирает удобный, а проверяющий видит источник каждой записи."}</p>
            </Reveal>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ways.map(([Icon, h, p], i) => (
                <Reveal key={h} delay={i * 60}>
                  <li className="lift h-full rounded-xl border border-line bg-paper p-4 hover:border-brand">
                    <Icon className="h-5 w-5 text-brand" strokeWidth={1.9} />
                    <h3 className="mt-4 text-[16px] leading-6 font-semibold">{h}</h3>
                    <p className="text-[14px] leading-5 text-mute">{p}</p>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* главное возражение: можно ли доверять данным */}
        <section className="border-y border-line bg-cream">
          <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-7 md:py-24">
            <Reveal><h2 className="max-w-[640px] text-[28px] leading-9 font-semibold tracking-[-0.02em] md:text-[36px] md:leading-[44px]">{kk ? "Деректер жоғалмайды және қолдан өзгертілмейді" : "Данные не теряются и не правятся задним числом"}</h2></Reveal>
            <ul className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-3">
              {trust.map(([Icon, h, p], i) => (
                <Reveal key={h} delay={i * 90}>
                  <li className="border-t border-ink pt-5"><Icon className="h-5 w-5" strokeWidth={1.9} /><h3 className="mt-4 text-[18px] leading-6 font-semibold">{h}</h3><p className="mt-2 text-[14px] leading-5 text-mute">{p}</p></li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* экология и имя продукта */}
        <section className="mx-auto max-w-[1200px] px-4 py-16 md:px-7 md:py-24">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-md bg-mint px-2.5 py-1 text-[14px] text-leafdark"><Leaf className="h-4 w-4" />DEFRA 2024 · {kk ? "ТДМ 12.3" : "ЦУР 12.3"}</span>
              <h2 className="mt-5 text-[28px] leading-9 font-semibold tracking-[-0.02em] md:text-[36px] md:leading-[44px]">{kk ? "Тек санап қоймайды — не істеу керегін айтады" : "Не только считает, но и подсказывает, что делать"}</h2>
              <p className="mt-4 max-w-[480px] text-[16px] leading-6 text-mute">{kk ? "Жүйе CO₂-эквивалентті есептейді, ұсынылған тәсілге көшкендегі үнемді көрсетеді және әр қалдық түріне «екінші өмір» ұсынады: компост, қайта өңдеу, фудшеринг." : "Система считает CO₂-эквивалент, показывает экономию при переходе на рекомендуемый способ и предлагает каждому виду отходов «вторую жизнь»: компост, переработку, фудшеринг."}</p>
            </Reveal>
            <Reveal delay={120}>
              <div className="rounded-xl border border-[#f1dd7e] bg-[#fff8d6] p-6 transition-transform duration-500 md:p-8 lg:-rotate-1 lg:hover:rotate-0">
                <div className="flex items-center gap-3 text-[14px] text-mute"><Logo size={40} />{kk ? "Атауы туралы" : "О названии"}</div>
                <p className="mt-4 text-[20px] leading-7 font-semibold tracking-[-0.01em]">{kk ? "Сарқыт — дастарханнан қонақтар алып кететін сый-тағам." : "Сарқыт — угощение, которое гости уносят с дастархана."}</p>
                <p className="mt-3 text-[16px] leading-6 text-mute">{kk ? "Қазақ дәстүрінде тамақ тасталмайды — ол әрі қарай беріледі. Sarqyt осы әдетті университет асханаларының есебіне қайтарады." : "В казахской традиции еду не выбрасывают, а передают дальше. Sarqyt возвращает эту привычку в учёт университетских столовых."}</p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="board-dark border-t border-line bg-ink text-white">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-4 py-12 md:px-7 md:py-16">
            <h2 className="max-w-[560px] text-[24px] leading-8 font-semibold tracking-[-0.02em] md:text-[32px] md:leading-10">{kk ? "Толық циклды демо-деректермен көріңіз" : "Посмотрите полный цикл на демо-данных"}</h2>
            <Link href="/login" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#fde050] px-6 text-[16px] font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5">{kk ? "Жүйеге кіру" : "Войти в систему"}<ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-[14px] text-mute md:px-7">
        <span className="flex items-center gap-2"><Logo size={22} /><Wordmark className="text-[16px] text-ink" /><span>· АТУ, 2026</span></span>
        <span>{kk ? "«Алматы технологиялық университеті» АҚ кампусына арналған MVP" : "MVP для кампуса АО «Алматинский технологический университет»"}</span>
      </footer>
    </div>
  );
}
