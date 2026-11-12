"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Leaf, TrendingUp, TriangleAlert } from "lucide-react";
import { PageHead, Shell } from "@/components/Shell";
import { useAuth } from "@/lib/auth";
import { useI18n, nm, monthName } from "@/lib/i18n";
import { fmt, co2 as co2calc, type Disposal, type Entry, type Org, type WasteType } from "@/lib/supabase";
import { loadRefs, loadRegistry } from "@/lib/data";

const COLORS = ["#2f55e6", "#8da2f2", "#f0a23b", "#2aa7a1", "#c3cad8", "#8a93a6", "#d8607e", "#16192c"];
const ANOMALY = 0.2; // рост более чем на 20 % к среднему предыдущих месяцев

// Рекомендации по сокращению — по ключевым словам вида отхода
const TIPS: [RegExp, string, string][] = [
  [/из зала|остатки еды/i, "Ввести порции двух размеров и убрать «комплекс по умолчанию»: отходы из зала обычно на 20–30 % состоят из несъеденных гарниров.", "Екі өлшемді порция енгізіңіз: залдан шыққан қалдықтың 20–30 %-ы — желінбеген гарнир."],
  [/нереализованн/i, "Планировать выпуск по данным продаж за тот же день недели; остатки за 1 час до закрытия продавать со скидкой или передавать на корм.", "Өндірісті апта күніндегі сатылым бойынша жоспарлаңыз; қалдықты жабылуға 1 сағат қалғанда жеңілдікпен сатыңыз."],
  [/очистки|фрукт|овощ/i, "Очистки овощей и фруктов — на компостирование или корм животным вместо вывоза на полигон.", "Көкөніс пен жеміс қабығын полигонға емес, компостқа немесе мал азығына жіберіңіз."],
  [/масло/i, "Отработанное масло сдавать лицензированному переработчику (биодизель) — это запрещено сливать и оно принимается бесплатно или за плату.", "Пайдаланылған майды лицензиясы бар өңдеушіге (биодизель) тапсырыңыз."],
  [/картон|упаков|ПЭТ|стекло|алюмини/i, "Тару (картон, ПЭТ, стекло, алюминий) собирать раздельно и сдавать во вторсырьё — это прямое снижение объёма ТБО.", "Ыдысты (картон, ПЭТ, шыны, алюминий) бөлек жинап, қайталама шикізатқа тапсырыңыз."],
  [/кофейн/i, "Кофейный жмых отдавать на компост и удобрение (теплицы, озеленение кампуса) или на производство скрабов.", "Кофе сығындысын компостқа, тыңайтқышқа (жылыжай, кампусты көгалдандыру) беріңіз."],
  [/хлеб|кондитер/i, "Отходы хлебобулочных изделий — на сухари, панировку или корм; планировать объём лабораторных образцов.", "Нан өнімдерінің қалдығын кептірілген нанға немесе азыққа пайдаланыңыз."],
  [/кост|мяс/i, "Кости и обрезки мяса — на бульоны и на корм через ветеринарно допустимые каналы; контролировать нормы разделки.", "Сүйек пен ет кесінділерін сорпаға және азыққа пайдаланыңыз; бөлшектеу нормаларын бақылаңыз."],
];

function Dashboard() {
  const { profile, org } = useAuth();
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [refs, setRefs] = useState<{ orgs: Org[]; types: WasteType[]; disposals: Disposal[] }>({ orgs: [], types: [], disposals: [] });
  const [loading, setLoading] = useState(true);
  const [orgFilter, setOrgFilter] = useState("");

  useEffect(() => {
    Promise.all([loadRefs(), loadRegistry()]).then(([rf, rg]) => { setRefs(rf); setEntries(rg.entries); setLoading(false); });
  }, []);

  const isResp = profile?.role === "responsible";
  const typeById = useMemo(() => Object.fromEntries(refs.types.map((x) => [x.id, x])), [refs.types]);
  const dispById = useMemo(() => Object.fromEntries(refs.disposals.map((x) => [x.id, x])), [refs.disposals]);
  const orgVol = (id: string) => entries.reduce((a, e) => a + (e.org_id === id ? Number(e.quantity) : 0), 0);
  const orgs = (isResp ? refs.orgs.filter((o) => o.id === org?.id) : [...refs.orgs]).sort((x, y) => orgVol(y.id) - orgVol(x.id));
  const data = useMemo(() => entries.filter((e) => !orgFilter || e.org_id === orgFilter), [entries, orgFilter]);

  const months = useMemo(() => [...new Set(data.map((e) => e.entry_date.slice(0, 7)))].sort(), [data]);
  const short = (o: Org) => nm(o, lang).replace(/Учебно-гостиничный комплекс |Столовый комплекс корп\. 1, 2 |Кофейня АТУ |\(ИП |\)|ИП /g, "").replace(/[«»]/g, "").trim();

  // 1. динамика по месяцам (стек по организациям)
  const dyn = months.map((m) => {
    const row: Record<string, number | string> = { m: monthName(m + "-01", lang, false) };
    for (const o of orgs) row[short(o)] = Math.round(data.filter((e) => e.org_id === o.id && e.entry_date.startsWith(m)).reduce((a, e) => a + Number(e.quantity), 0));
    return row;
  });
  // 2. структура по видам (объединяем по названию)
  const byName: Record<string, number> = {};
  for (const e of data) { const n = nm(typeById[e.waste_type_id], lang); byName[n] = (byName[n] || 0) + Number(e.quantity); }
  const sorted = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  const struct = [...sorted.slice(0, 7).map(([name, value]) => ({ name, value: Math.round(value) })),
    ...(sorted.length > 7 ? [{ name: lang === "kk" ? "Басқа" : "Прочее", value: Math.round(sorted.slice(7).reduce((a, x) => a + x[1], 0)) }] : [])];
  // 3. сравнение организаций
  const cmp = orgs.map((o) => ({ name: short(o), value: Math.round(data.filter((e) => e.org_id === o.id).reduce((a, e) => a + Number(e.quantity), 0)) })).sort((a, b) => b.value - a.value);
  // для одной организации сравнение бессмысленно — показываем, куда уходят отходы
  const dispAgg: Record<string, { name: string; value: number; good: boolean }> = {};
  for (const e of data) {
    const d = dispById[e.disposal_id ?? ""]; const better = !!d?.code && d.code !== "TBO";
    const o = (dispAgg[better ? d.id : "tbo"] ??= { name: better ? nm(d, lang) : lang === "kk" ? "ҚТҚ полигонға шығару" : "Вывоз ТБО на полигон", value: 0, good: better });
    o.value += Number(e.quantity);
  }
  const bars: { name: string; value: number; good?: boolean }[] = isResp ? Object.values(dispAgg).map((x) => ({ ...x, value: Math.round(x.value) })).sort((a, b) => b.value - a.value) : cmp;

  // KPI
  const total = data.reduce((a, e) => a + Number(e.quantity), 0);
  let co2 = 0, potential = 0, saved = 0;
  const potByName: Record<string, { kg: number; co2: number; rec: string; orgs: Set<string> }> = {};
  for (const e of data) {
    const w = typeById[e.waste_type_id]; const c = co2calc(e, w, dispById[e.disposal_id ?? ""]);
    co2 += c.actual; potential += c.potential; saved += c.saved;
    if (c.potential > 0 && w) {
      const k = nm(w, lang); const p = (potByName[k] ??= { kg: 0, co2: 0, rec: nm(dispById[w.recommended_disposal_id ?? ""], lang), orgs: new Set() });
      p.kg += Number(e.quantity); p.co2 += c.potential; p.orgs.add(e.org_id);
    }
  }
  const potTop = Object.entries(potByName).sort((a, b) => b[1].co2 - a[1].co2).slice(0, 5);
  const recyclable = data.filter((e) => (typeById[e.waste_type_id]?.recyclability ?? "yes") === "yes").reduce((a, e) => a + Number(e.quantity), 0);
  const partial = data.filter((e) => typeById[e.waste_type_id]?.recyclability === "partial").reduce((a, e) => a + Number(e.quantity), 0);
  const recycled = data.filter((e) => dispById[e.disposal_id ?? ""]?.is_recycling).reduce((a, e) => a + Number(e.quantity), 0);
  const sumMonth = (m: string, f: (e: Entry) => boolean = () => true) => data.filter((e) => e.entry_date.startsWith(m) && f(e)).reduce((a, e) => a + Number(e.quantity), 0);
  const curM = new Date().toISOString().slice(0, 7);
  const full = months.filter((m) => m < curM); // полные месяцы
  const last = full[full.length - 1], prev = full[full.length - 2];
  const delta = last && prev && sumMonth(prev) > 0 ? (sumMonth(last) - sumMonth(prev)) / sumMonth(prev) : null;
  // квартал к кварталу
  const qOf = (m: string) => `${m.slice(0, 4)}-Q${Math.ceil(Number(m.slice(5, 7)) / 3)}`;
  const quarters = [...new Set(months.map(qOf))].sort();
  const qSum = (q: string) => data.filter((e) => qOf(e.entry_date.slice(0, 7)) === q).reduce((a, e) => a + Number(e.quantity), 0);

  // отклонения: последний полный месяц к среднему предыдущих, по организации и виду
  const anomalies = useMemo(() => {
    if (!last || full.length < 2) return [];
    const before = full.slice(0, -1);
    const out: { org: Org; type: WasteType; pct: number; now: number; avg: number }[] = [];
    for (const o of orgs) for (const w of refs.types.filter((x) => x.org_id === o.id)) {
      const now = sumMonth(last, (e) => e.waste_type_id === w.id);
      const avg = before.reduce((a, m) => a + sumMonth(m, (e) => e.waste_type_id === w.id), 0) / before.length;
      if (avg >= 20 && now > avg * (1 + ANOMALY)) out.push({ org: o, type: w, pct: (now - avg) / avg, now, avg });
    }
    return out.sort((a, b) => b.pct - a.pct).slice(0, 6);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, refs, last]);

  const tips = useMemo(() => {
    const out: string[] = [];
    for (const [name] of sorted.slice(0, 6)) {
      const ru = refs.types.find((x) => nm(x, lang) === name)?.name_ru ?? name;
      const tip = TIPS.find(([re]) => re.test(ru));
      if (tip) { const s = tip[lang === "kk" ? 2 : 1]; if (!out.includes(s)) out.push(s); }
    }
    return out.slice(0, 4);
  }, [sorted, refs.types, lang]);

  if (loading) return (
    <div role="status" aria-label={t("loading")}>
      <div className="skeleton mb-2 h-9 w-64" /><div className="skeleton mb-6 h-5 w-80 max-w-full" />
      <div className="skeleton mb-6 h-28 w-full !rounded-xl" /><div className="skeleton h-80 w-full !rounded-xl" />
    </div>
  );

  const period = months.length ? `${monthName(months[0] + "-01", lang)} – ${monthName(months[months.length - 1] + "-01", lang)}` : "";
  const tip = { contentStyle: { borderRadius: 8, border: "1px solid #e3e8ee", fontSize: 12.5, padding: "8px 10px" }, cursor: { fill: "#f6f8fa" } };

  return (
    <>
      <PageHead title={t("dashTitle")} sub={<span className="inline-block first-letter:uppercase">{period}{lang === "kk" ? " · тек қабылданған есептер" : " · только принятые отчёты"}</span>}>
        {!isResp && (
          <select className="field !w-auto !min-w-56" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label={t("organization")}>
            <option value="">{lang === "kk" ? "Барлық ұйым" : "Все организации"}</option>{refs.orgs.map((o) => <option key={o.id} value={o.id}>{nm(o, lang)}</option>)}
          </select>
        )}
      </PageHead>

      <div className="card mb-6 grid grid-cols-2 !p-0 lg:grid-cols-4">
        <Kpi label={t("kpiMass")} value={total >= 1000 ? fmt(total / 1000) : fmt(total)} unit={total >= 1000 ? "т" : t("kg")}
          chip={delta != null ? { text: `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%`, tone: delta > 0.05 ? "bad" : delta < -0.05 ? "good" : "flat" } : undefined}
          sub={last && prev ? `${monthName(last + "-01", lang, false)} / ${monthName(prev + "-01", lang, false)}` : ""} />
        <Kpi label={t("kpiCo2")} value={co2 >= 1000 ? fmt(co2 / 1000) : fmt(co2)} unit={co2 >= 1000 ? "т CO₂e" : "кг CO₂e"} sub={`${lang === "kk" ? "үнемделді" : "уже сэкономлено"}: ${fmt(saved)} кг`} className="border-l border-line" />
        <Kpi label={lang === "kk" ? "CO₂ үнемдеу әлеуеті" : "Потенциал экономии CO₂"} value={potential >= 1000 ? fmt(potential / 1000) : fmt(potential)} unit={potential >= 1000 ? "т CO₂e" : "кг CO₂e"} accent
          sub={lang === "kk" ? "ұсынылған тәсілдерге көшкенде" : "при рекомендуемых способах"} className="border-t border-line lg:border-t-0 lg:border-l" />
        <Kpi label={lang === "kk" ? "Өңдеуге жіберілді" : "Ушло на переработку"} value={total ? String(Math.round((recycled / total) * 100)) : "0"} unit="%"
          sub={`${lang === "kk" ? "жарамды" : "пригодно"}: ${total ? Math.round((recyclable / total) * 100) : 0}%${partial > 0 ? ` + ${Math.round((partial / total) * 100)}% ${lang === "kk" ? "ішінара" : "частично"}` : ""}`} className="border-t border-l border-line lg:border-t-0" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="h2">{t("chDynamics")}</h2>
            {quarters.length > 1 && (
              <p className="text-[14px] text-mute">
                {quarters.map((q, i) => (
                  <span key={q}>{i > 0 && <span className="mx-1.5 text-faint">/</span>}{q.slice(5)} {q.slice(0, 4)}: <b className="num font-semibold text-ink">{fmt(qSum(q))} {t("kg")}</b>
                    {q === qOf(curM) ? <span> ({lang === "kk" ? "толық емес" : "неполный"})</span> : i > 0 && qSum(quarters[i - 1]) > 0 && <span className="num"> ({qSum(q) > qSum(quarters[i - 1]) ? "+" : ""}{Math.round(((qSum(q) - qSum(quarters[i - 1])) / qSum(quarters[i - 1])) * 100)}%)</span>}
                  </span>
                ))}
              </p>
            )}
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={dyn} margin={{ left: -14, right: 4, top: 4 }} barCategoryGap="28%">
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 12, fill: "#697386" }} axisLine={{ stroke: "#e3e8ee" }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#8792a2" }} axisLine={false} tickLine={false} />
                <Tooltip {...tip} formatter={(v) => `${fmt(Number(v))} ${t("kg")}`} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12.5, color: "#697386", paddingTop: 8 }} />
                {orgs.map((o, i) => <Bar key={o.id} dataKey={short(o)} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === orgs.length - 1 ? [4, 4, 0, 0] : 0} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="h2 mb-4">{t("chStructure")}</h2>
          <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
            <div className="h-44">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={struct} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={1.5} stroke="none">
                    {struct.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...tip} formatter={(v) => `${fmt(Number(v))} ${t("kg")}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 space-y-1.5 text-[14px]">
              {struct.map((x, i) => (
                <li key={x.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate text-ink">{x.name}</span>
                  <span className="num font-semibold">{total ? Math.round((x.value / total) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card">
          <h2 className="h2 mb-4">{isResp ? (lang === "kk" ? "Қалдық қайда кетеді, кг" : "Куда уходят отходы, кг") : t("chOrgs")}</h2>
          <ul className="space-y-3">
            {bars.map((x) => (
              <li key={x.name}>
                <div className="mb-1 flex justify-between text-[14px]"><span className="text-ink">{x.name}</span><span className="num font-semibold">{fmt(x.value)} {t("kg")}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-[#eef1f5]"><div className={`h-full rounded-full ${x.good === undefined ? "bg-brand" : x.good ? "bg-leaf" : "bg-[#9aa1b0]"}`} style={{ width: `${bars[0]?.value ? Math.max(2, (x.value / bars[0].value) * 100) : 0}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card !p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-4 md:px-6">
            <h2 className="h2 flex items-center gap-2"><TriangleAlert className="h-4 w-4 text-amber" />{t("anomalies")}</h2>
            {last && <span className="text-[14px] inline-block first-letter:uppercase text-mute">{monthName(last + "-01", lang, false)} · {lang === "kk" ? "орташаға қарағанда" : "к среднему"} +{Math.round(ANOMALY * 100)}%</span>}
          </div>
          {anomalies.length === 0 ? <p className="px-5 py-8 text-center text-[14px] text-mute">{t("noAnomalies")}</p> : (
            <ul className="divide-y divide-line">
              {anomalies.map((a, i) => (
                <li key={i} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 md:px-6">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold">{nm(a.type, lang)}</div>
                    <div className="num truncate text-[12px] text-mute">{short(a.org)} · {fmt(a.avg)} – {fmt(a.now)} {t(a.type.unit)}</div>
                  </div>
                  <span className="num inline-flex items-center gap-1 rounded-md bg-[#fdeaf0] px-2 py-[3px] text-[12px] font-semibold text-[#a8284c]"><TrendingUp className="h-3 w-3" />+{Math.round(a.pct * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card !p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-4 md:px-6">
            <h2 className="h2 flex items-center gap-2"><Leaf className="h-4 w-4 text-leaf" />{t("recommendations")}</h2>
            <span className="text-[14px] text-mute">DEFRA 2024</span>
          </div>
          <ul className="divide-y divide-line">
            {potTop.map(([name, p]) => (
              <li key={name} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 md:px-6">
                <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{name}</span><span className="num block truncate text-[12px] text-mute">{fmt(p.kg)} {t("kg")} · {p.rec}</span></span>
                <span className="num whitespace-nowrap rounded-md bg-mint px-2 py-[3px] text-[12px] font-semibold text-leafdark">−{fmt(p.co2)} кг CO₂e</span>
              </li>
            ))}
          </ul>
          {tips.length > 0 && (
            <ul className="space-y-2 border-t border-line bg-wash px-4 py-4 md:px-6 text-[14px] text-ink">
              {tips.map((s, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" /><span>{s}</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, unit, sub, chip, accent, className = "" }: { label: string; value: string; unit: string; sub?: string; chip?: { text: string; tone: "good" | "bad" | "flat" }; accent?: boolean; className?: string }) {
  const tone = { good: "bg-mint text-leafdark", bad: "bg-[#fdeaf0] text-[#a8284c]", flat: "bg-[#f0f2f5] text-[#545969]" };
  return (
    <div className={`min-w-0 p-4 md:p-6 ${className}`}>
      <div className="eyebrow truncate">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`num text-[28px] font-semibold leading-none tracking-[-0.025em] ${accent ? "text-leaf" : ""}`}>{value}<span className="ml-1 text-[14px] font-normal tracking-normal text-mute">{unit}</span></span>
        {chip && <span className={`num rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${tone[chip.tone]}`}>{chip.text}</span>}
      </div>
      {sub && <div className="mt-2 text-[14px] leading-5 text-mute">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  return <Shell><Dashboard /></Shell>;
}
