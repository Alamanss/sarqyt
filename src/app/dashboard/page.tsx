"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/lib/auth";
import { useI18n, nm, monthName } from "@/lib/i18n";
import { fmt, co2 as co2calc, type Disposal, type Entry, type Org, type WasteType } from "@/lib/supabase";
import { loadRefs, loadRegistry } from "@/lib/data";

const COLORS = ["#1f7a4d", "#f2a71b", "#c8502d", "#2f6fb0", "#7b5ea7", "#3aa6a0", "#b8860b", "#8d99a6"];
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
  const orgs = isResp ? refs.orgs.filter((o) => o.id === org?.id) : refs.orgs;
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

  if (loading) return <div className="text-mute">{t("loading")}</div>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">{t("dashTitle")}</h1>
        {!isResp && (
          <select className="field !w-auto" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label={t("organization")}>
            <option value="">{t("all")}</option>{refs.orgs.map((o) => <option key={o.id} value={o.id}>{nm(o, lang)}</option>)}
          </select>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("kpiMass")} value={total >= 1000 ? fmt(total / 1000) : fmt(total)} unit={total >= 1000 ? "т" : t("kg")} sub={(months.length ? `${monthName(months[0] + "-01", lang, false)} – ${monthName(months[months.length - 1] + "-01", lang, false)}` : "") + (delta != null && last && prev ? ` · ${monthName(last + "-01", lang, false)}: ${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%` : "")} dark />
        <Kpi label={t("kpiCo2")} value={co2 >= 1000 ? fmt(co2 / 1000) : fmt(co2)} unit={co2 >= 1000 ? "т CO₂e" : "кг CO₂e"} sub={`DEFRA 2024 · ${lang === "kk" ? "үнемделді" : "уже сэкономлено"} ${fmt(saved)} кг`} />
        <Kpi label={lang === "kk" ? "CO₂ үнемдеу әлеуеті" : "Потенциал экономии CO₂"} value={potential >= 1000 ? fmt(potential / 1000) : fmt(potential)} unit={potential >= 1000 ? "т CO₂e" : "кг CO₂e"} sub={lang === "kk" ? "ұсынылған тәсілге көшкенде" : "при переходе на рекомендуемые способы"} tone="good" />
        <Kpi label={lang === "kk" ? "Өңдеуге жіберілді" : "Ушло на переработку"} value={total ? String(Math.round((recycled / total) * 100)) : "0"} unit="%" sub={`${t("kpiRecyclable").toLowerCase()}: ${total ? Math.round((recyclable / total) * 100) : 0}%${partial > 0 ? ` + ${Math.round((partial / total) * 100)}% ${lang === "kk" ? "ішінара" : "частично"}` : ""}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card lg:col-span-2">
          <h2 className="h2 mb-3">{t("chDynamics")}</h2>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={dyn} margin={{ left: -10, right: 8 }}>
                <CartesianGrid stroke="#e3ddcd" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `${fmt(Number(v))} ${t("kg")}`} /><Legend wrapperStyle={{ fontSize: 12 }} />
                {orgs.map((o, i) => <Bar key={o.id} dataKey={short(o)} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === orgs.length - 1 ? [6, 6, 0, 0] : 0} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {quarters.length > 1 && (
            <p className="mt-2 text-[13px] text-mute">
              {quarters.map((q, i) => (
                <span key={q}>{i > 0 && " → "}<b className="text-ink">{q.slice(5)} {q.slice(0, 4)}</b>: <span className="num">{fmt(qSum(q))} {t("kg")}</span>{q === qOf(curM) && <span> ({lang === "kk" ? "толық емес" : "неполный"})</span>}
                  {i > 0 && q !== qOf(curM) && qSum(quarters[i - 1]) > 0 && <span className="num"> ({qSum(q) > qSum(quarters[i - 1]) ? "+" : ""}{Math.round(((qSum(q) - qSum(quarters[i - 1])) / qSum(quarters[i - 1])) * 100)}%)</span>}
                </span>
              ))}
            </p>
          )}
        </div>

        <div className="card">
          <h2 className="h2 mb-3">{t("chStructure")}</h2>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={struct} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="80%" paddingAngle={2}>
                  {struct.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `${fmt(Number(v))} ${t("kg")}`} /><Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="h2 mb-3">{t("chOrgs")}</h2>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={cmp} layout="vertical" margin={{ left: 10, right: 16 }}>
                <CartesianGrid stroke="#e3ddcd" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${fmt(Number(v))} ${t("kg")}`} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>{cmp.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="h2 mb-2">⚠ {t("anomalies")}{last ? ` · ${monthName(last + "-01", lang, false)}` : ""}</h2>
          {anomalies.length === 0 ? <p className="text-[14px] text-mute">{t("noAnomalies")}</p> : (
            <ul className="divide-y divide-line">
              {anomalies.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold">{nm(a.type, lang)}</div>
                    <div className="truncate text-[12px] text-mute">{short(a.org)} · {fmt(a.avg)} → {fmt(a.now)} {t(a.type.unit)}</div>
                  </div>
                  <span className="num rounded-full bg-clay/15 px-2.5 py-0.5 text-[13px] font-bold text-clay">+{Math.round(a.pct * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card !bg-pine !text-white">
          <h2 className="mb-2 text-lg font-bold">💡 {t("recommendations")}</h2>
          <ul className="mb-3 divide-y divide-white/10 text-[14px]">
            {potTop.map(([name, p]) => (
              <li key={name} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0"><b className="block truncate">{name}</b><span className="block truncate text-[12px] text-white/60">{fmt(p.kg)} {t("kg")} → {p.rec}</span></span>
                <span className="num whitespace-nowrap rounded-full bg-amber px-2.5 py-0.5 text-[13px] font-bold text-ink">−{fmt(p.co2)} кг CO₂e</span>
              </li>
            ))}
          </ul>
          <ul className="space-y-2 text-[13px] text-white/80">
            {tips.map((s, i) => <li key={i} className="flex gap-2"><span className="text-amber">●</span><span>{s}</span></li>)}
          </ul>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, unit, sub, dark, tone }: { label: string; value: string; unit: string; sub?: string; dark?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className={`card ${dark ? "!bg-pine !text-white" : ""}`}>
      <div className={`text-[12px] font-semibold uppercase tracking-wide ${dark ? "text-white/60" : "text-mute"}`}>{label}</div>
      <div className={`num mt-1 text-3xl font-bold ${tone === "bad" ? "text-clay" : tone === "good" ? "text-leaf" : ""}`}>{value}<span className="ml-1 text-base font-semibold opacity-70">{unit}</span></div>
      {sub && <div className={`mt-1 truncate text-[12px] ${dark ? "text-white/60" : "text-mute"}`}>{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  return <Shell><Dashboard /></Shell>;
}
