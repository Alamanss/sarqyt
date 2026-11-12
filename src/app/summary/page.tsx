"use client";
import { useEffect, useMemo, useState } from "react";
import { CircleCheck, Download, TriangleAlert } from "lucide-react";
import { PageHead, Shell } from "@/components/Shell";
import { useI18n, nm, monthName } from "@/lib/i18n";
import { fmt, type Disposal, type Entry, type Org, type Report, type WasteType } from "@/lib/supabase";
import { loadRefs, loadRegistry, loadReports } from "@/lib/data";

type Mode = "month" | "quarter" | "year";
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

function Summary() {
  const { t, lang } = useI18n();
  const now = new Date();
  const [mode, setMode] = useState<Mode>("quarter");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.max(1, Math.ceil((now.getMonth() + 1) / 3) - 1) || 1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [refs, setRefs] = useState<{ orgs: Org[]; types: WasteType[]; disposals: Disposal[] }>({ orgs: [], types: [], disposals: [] });
  const [loading, setLoading] = useState(true);

  const [m1, m2] = mode === "month" ? [month, month] : mode === "quarter" ? [quarter * 3 - 2, quarter * 3] : [1, 12];
  const from = `${year}-${pad(m1)}-01`;
  const to = `${year}-${pad(m2)}-${pad(lastDay(year, m2))}`;
  const months = useMemo(() => Array.from({ length: m2 - m1 + 1 }, (_, i) => `${year}-${pad(m1 + i)}`), [year, m1, m2]);

  useEffect(() => { loadRefs().then(setRefs); loadReports().then(setReports); }, []);
  useEffect(() => { setLoading(true); loadRegistry(from, to).then((r) => { setEntries(r.entries); setLoading(false); }); }, [from, to]);

  const typeById = useMemo(() => Object.fromEntries(refs.types.map((x) => [x.id, x])), [refs.types]);
  const activeOrgs = refs.orgs.filter((o) => o.active);

  // организация → вид → месяц → сумма
  const table = useMemo(() => {
    const out: Record<string, Record<string, Record<string, number>>> = {};
    for (const e of entries) {
      const o = (out[e.org_id] ??= {}); const w = (o[e.waste_type_id] ??= {});
      const k = e.entry_date.slice(0, 7); w[k] = (w[k] || 0) + Number(e.quantity);
    }
    return out;
  }, [entries]);

  // несдавшие: нет принятого отчёта за месяц периода (до текущего месяца включительно)
  const curMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const missing = useMemo(() => {
    const out: { org: Org; month: string; status: string | null }[] = [];
    for (const m of months) {
      if (m > curMonth) continue;
      for (const o of activeOrgs) {
        const r = reports.find((x) => x.org_id === o.id && x.period_start.slice(0, 7) === m);
        if (!r || r.status !== "accepted") out.push({ org: o, month: m, status: r?.status ?? null });
      }
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, reports, refs.orgs]);

  const periodLabel = mode === "month" ? monthName(from, lang) : mode === "quarter" ? `${quarter} ${t("quarter").toLowerCase()} ${year}` : `${year}`;

  async function exportExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "ZeroWaste ATU";
    const head = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF0F3A28" } };
    const thin = { style: "thin" as const, color: { argb: "FFBBBBBB" } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    // Лист 1 — свод по организациям и видам отходов
    const ws = wb.addWorksheet("Сводный отчёт");
    ws.mergeCells(1, 1, 1, 3 + months.length + 1);
    ws.getCell(1, 1).value = "Таблица учёта пищевых отходов в университетском комплексе АО «АТУ»";
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.mergeCells(2, 1, 2, 3 + months.length + 1);
    ws.getCell(2, 1).value = `Сводный отчёт за период: ${periodLabel} (${from} — ${to}). Только принятые отчёты.`;
    const hdr = ["Организация", "Наименование отходов", "Ед.", ...months.map((m) => monthName(m + "-01", "ru")), "Итого"];
    const hr = ws.addRow([]); void hr;
    const h = ws.addRow(hdr);
    h.eachCell((c) => { c.fill = head; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.border = border; c.alignment = { vertical: "middle", wrapText: true }; });
    let grandKg = 0, grandL = 0;
    for (const o of activeOrgs) {
      const byType = table[o.id] ?? {};
      const ids = Object.keys(byType).sort((a, b) => (typeById[a]?.name_ru ?? "").localeCompare(typeById[b]?.name_ru ?? ""));
      let orgKg = 0, orgL = 0;
      ids.forEach((tid, i) => {
        const vals = months.map((m) => Math.round((byType[tid][m] || 0) * 10) / 10);
        const sum = Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10;
        if (typeById[tid]?.unit === "l") orgL += sum; else orgKg += sum;
        const r = ws.addRow([i === 0 ? o.name_ru : "", typeById[tid]?.name_ru ?? "", typeById[tid]?.unit === "l" ? "л" : "кг", ...vals, sum]);
        r.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
      });
      const tr = ws.addRow([`Итого: ${o.name_ru}`, "", "кг", ...months.map((m) => Math.round(ids.filter((x) => typeById[x]?.unit !== "l").reduce((a, x) => a + (byType[x][m] || 0), 0) * 10) / 10), Math.round(orgKg * 10) / 10]);
      tr.eachCell({ includeEmpty: true }, (c) => { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDFF3E6" } }; c.border = border; });
      if (orgL > 0) {
        const lr = ws.addRow([`Итого (жидкие): ${o.name_ru}`, "", "л", ...months.map((m) => Math.round(ids.filter((x) => typeById[x]?.unit === "l").reduce((a, x) => a + (byType[x][m] || 0), 0) * 10) / 10), Math.round(orgL * 10) / 10]);
        lr.eachCell({ includeEmpty: true }, (c) => { c.font = { bold: true }; c.border = border; });
      }
      grandKg += orgKg; grandL += orgL;
    }
    const g = ws.addRow(["ВСЕГО по университетскому комплексу", "", "кг", ...months.map((m) => Math.round(entries.filter((e) => e.entry_date.startsWith(m) && typeById[e.waste_type_id]?.unit !== "l").reduce((a, e) => a + Number(e.quantity), 0) * 10) / 10), Math.round(grandKg * 10) / 10]);
    g.eachCell({ includeEmpty: true }, (c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = head; c.border = border; });
    if (grandL > 0) ws.addRow(["ВСЕГО жидких отходов", "", "л", ...months.map(() => ""), Math.round(grandL * 10) / 10]).font = { bold: true };
    const co2 = entries.reduce((a, e) => a + Number(e.quantity) * Number(typeById[e.waste_type_id]?.co2_factor ?? 0), 0);
    ws.addRow([]);
    ws.addRow([`CO₂-эквивалент за период: ${Math.round(co2)} кг (по коэффициентам справочника видов отходов)`]);
    ws.addRow([`Сформировано: ${new Date().toLocaleString("ru-RU")} · ZeroWaste ATU`]);
    ws.columns.forEach((c, i) => { c.width = i === 0 ? 44 : i === 1 ? 46 : i === 2 ? 6 : 16; });

    // Лист 2 — журнал записей по структуре действующих таблиц
    const ws2 = wb.addWorksheet("Журнал записей");
    const h2 = ws2.addRow(["Дата", "Организация", "Наименование отходов", "Вес (кг) / Объём (л)", "Ед.", "Способ переработки / утилизации"]);
    h2.eachCell((c) => { c.fill = head; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.border = border; });
    const orgById = Object.fromEntries(refs.orgs.map((o) => [o.id, o]));
    const dispById = Object.fromEntries(refs.disposals.map((d) => [d.id, d]));
    [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date)).forEach((e) => {
      ws2.addRow([e.entry_date, orgById[e.org_id]?.name_ru, typeById[e.waste_type_id]?.name_ru, Number(e.quantity), typeById[e.waste_type_id]?.unit === "l" ? "л" : "кг", dispById[e.disposal_id ?? ""]?.name_ru ?? ""]);
    });
    ws2.columns.forEach((c, i) => { c.width = [12, 44, 44, 20, 6, 34][i]; });

    // Лист 3 — несдавшие
    const ws3 = wb.addWorksheet("Не сдали отчёт");
    ws3.addRow(["Организация", "Месяц", "Статус"]).font = { bold: true };
    missing.forEach((x) => ws3.addRow([x.org.name_ru, monthName(x.month + "-01", "ru"), x.status ?? "нет отчёта"]));
    ws3.columns.forEach((c, i) => { c.width = [44, 20, 18][i]; });

    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `ATU-otchet-othody-${from}_${to}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const totalKg = entries.filter((e) => typeById[e.waste_type_id]?.unit !== "l").reduce((a, e) => a + Number(e.quantity), 0);

  return (
    <>
      <PageHead title={t("summaryTitle")} sub={<>{lang === "kk" ? "Кезең" : "Период"}: <span className="inline-block first-letter:uppercase">{periodLabel}</span> · {lang === "kk" ? "тек қабылданған есептер" : "только принятые отчёты"}</>}>
        <button type="button" className="btn-primary" onClick={exportExcel} disabled={loading || entries.length === 0}><Download className="h-4 w-4" />{t("exportExcel")}</button>
      </PageHead>
      <div className="card mb-5 flex flex-wrap items-center gap-3 !py-3">
        <div className="seg">
          {(["month", "quarter", "year"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={mode === m ? "seg-on" : "seg-off"}>{t(m)}</button>
          ))}
        </div>
        {mode === "month" && (
          <select className="field !w-auto inline-block first-letter:uppercase" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label={t("month")}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(`${year}-${pad(i + 1)}-01`, lang, false)}</option>)}
          </select>
        )}
        {mode === "quarter" && (
          <select className="field !w-auto" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} aria-label={t("quarter")}>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q} {t("quarter").toLowerCase()}</option>)}
          </select>
        )}
        <select className="field !w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t("year")}>
          {[now.getFullYear() - 1, now.getFullYear()].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="ml-auto text-right">
          <div className="eyebrow">{t("total")}</div>
          <div className="num text-[22px] font-semibold tracking-[-0.02em]">{fmt(totalKg)} {t("kg")}</div>
        </div>
      </div>

      <div className={`mb-5 rounded-xl border px-4 py-3 sm:px-5 ${missing.length ? "border-[#f2dfb5] bg-[#fdf8ea]" : "border-[#bfe6d8] bg-mint"}`}>
        <h2 className={`flex items-center gap-2 text-[14px] font-semibold ${missing.length ? "mb-2 text-[#8a5a00]" : "text-leafdark"}`}>{missing.length ? <TriangleAlert className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}{missing.length ? t("notSubmitted") : t("allSubmitted")}</h2>
        {missing.length > 0 && (
          <ul className="grid gap-x-8 text-[13.5px] sm:grid-cols-2">
            {missing.map((x, i) => (
              <li key={i} className="flex justify-between gap-2 border-t border-[#f2dfb5] py-1.5">
                <span>{nm(x.org, lang)}</span>
                <span className="whitespace-nowrap inline-block first-letter:uppercase text-mute">{monthName(x.month + "-01", lang, false)}{x.status ? ` · ${t(("st_" + x.status) as "st_draft")}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-line bg-wash"><tr>
            <th className="th">{t("organization")} / {t("wasteType")}</th>
            {months.map((m) => <th key={m} className="th text-right first-letter:uppercase">{monthName(m + "-01", lang, false)}</th>)}
            <th className="th text-right">{t("total")}</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td className="td text-mute" colSpan={months.length + 2}>{t("loading")}</td></tr> : activeOrgs.map((o) => {
              const byType = table[o.id] ?? {};
              const ids = Object.keys(byType).sort((a, b) => (typeById[a]?.name_ru ?? "").localeCompare(typeById[b]?.name_ru ?? ""));
              const kgIds = ids.filter((x) => typeById[x]?.unit !== "l");
              return [
                <tr key={o.id} className="border-t border-line bg-wash">
                  <td className="td font-semibold">{nm(o, lang)}</td>
                  {months.map((m) => <td key={m} className="td num text-right font-semibold">{fmt(kgIds.reduce((a, x) => a + (byType[x][m] || 0), 0))}</td>)}
                  <td className="td num text-right font-semibold">{fmt(kgIds.reduce((a, x) => a + months.reduce((s, m) => s + (byType[x][m] || 0), 0), 0))} {t("kg")}</td>
                </tr>,
                ...ids.map((tid) => (
                  <tr key={o.id + tid} className="border-t border-line">
                    <td className="td !pl-8 text-[13px] text-[#3c4257]">{nm(typeById[tid], lang)}</td>
                    {months.map((m) => <td key={m} className="td num text-right text-[13px]">{byType[tid][m] ? fmt(byType[tid][m]) : "—"}</td>)}
                    <td className="td num text-right text-[13px] font-medium">{fmt(months.reduce((s, m) => s + (byType[tid][m] || 0), 0))} {t(typeById[tid]?.unit ?? "kg")}</td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function SummaryPage() {
  return <Shell roles={["reviewer", "admin", "management"]}><Summary /></Shell>;
}
