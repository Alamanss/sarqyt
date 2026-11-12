"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/lib/auth";
import { useI18n, nm, dateRu } from "@/lib/i18n";
import { supabase, today, type Report, type WasteType } from "@/lib/supabase";
import { api, errText } from "@/lib/data";

type Row = { date: string; name: string; quantity: number; typeId: string | null; skip?: boolean };
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

function toIso(v: unknown, fallbackMonth: string): string {
  if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (m) { const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : fallbackMonth.slice(0, 4); return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return "";
}

function ImportInner() {
  const { org } = useAuth();
  const { t, lang } = useI18n();
  const [types, setTypes] = useState<WasteType[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<"import" | "ocr">("import");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const xlsRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!org) return;
    supabase.from("waste_types").select("*").or(`org_id.eq.${org.id},org_id.is.null`).eq("active", true).order("created_at").then(({ data }) => setTypes((data ?? []) as WasteType[]));
  }, [org]);
  const typeById = useMemo(() => Object.fromEntries(types.map((x) => [x.id, x])), [types]);
  const match = (name: string) => {
    const n = norm(name);
    return (types.find((x) => norm(x.name_ru) === n) ?? types.find((x) => norm(x.name_ru).includes(n) || n.includes(norm(x.name_ru))))?.id ?? null;
  };

  async function onExcel(file: File) {
    setBusy("Excel…"); setMsg(""); setSource("import");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const out: Row[] = [];
      for (const ws of wb.worksheets) {
        let cd = 0, cn = 0, cq = 0;
        ws.eachRow((row) => {
          const cells = (row.values as unknown[]).map((c) => (c && typeof c === "object" && !(c instanceof Date) ? ((c as { text?: string; result?: unknown }).text ?? (c as { result?: unknown }).result ?? "") : c));
          if (!cd) { // ищем строку заголовков
            cells.forEach((c, i) => {
              const s = norm(String(c ?? ""));
              if (s.startsWith("дата")) cd = i;
              else if (s.includes("наименование")) cn = i;
              else if (s.startsWith("вес") || s.includes("объ") || s.includes("колич")) cq = i;
            });
            if (!(cd && cn && cq)) cd = cn = cq = 0;
            return;
          }
          const q = Number(String(cells[cq] ?? "").replace(",", "."));
          const name = String(cells[cn] ?? "").trim();
          const date = toIso(cells[cd], today());
          if (name && q > 0 && date) out.push({ date, name, quantity: q, typeId: match(name) });
        });
        if (out.length) break;
      }
      setRows(out);
      if (!out.length) setMsg("Не нашёл строк: в таблице должны быть столбцы «Дата», «Наименование отходов», «Вес (кг) / Объём (л)».");
    } catch (e) { setMsg(String((e as Error).message)); }
    setBusy("");
  }

  async function onPhoto(file: File) {
    setBusy(lang === "kk" ? "ЖИ бланкіні оқуда…" : "ИИ читает бланк…"); setMsg(""); setSource("ocr");
    try {
      const img = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const j = await api("/api/ai/ocr", { image: c.toDataURL("image/jpeg", 0.85), types: types.map((x) => ({ id: x.id, name: x.name_ru })), month: today().slice(0, 7) });
      const out: Row[] = (j.rows ?? []).map((r: Row) => ({ ...r, date: toIso(r.date, today()), typeId: r.typeId ?? match(r.name) }));
      setRows(out);
      if (!out.length) setMsg("ИИ не распознал строки на фото. Попробуйте снять бланк ровнее и при хорошем свете.");
    } catch (e) { setMsg(String((e as Error).message)); }
    setBusy("");
  }

  async function run() {
    if (!org) return;
    setBusy("…"); setMsg("");
    let ok = 0, fail = 0; const reports: Record<string, Report> = {}; let lastErr = "";
    for (const r of rows.filter((x) => !x.skip)) {
      try {
        let typeId = r.typeId;
        if (!typeId) { // новый вид отхода добавляется в справочник организации
          const { data, error } = await supabase.from("waste_types").insert({ org_id: org.id, name_ru: r.name, name_kk: r.name, unit: "kg", co2_factor: 0.70021 }).select().single();
          if (error) throw error;
          typeId = (data as WasteType).id; rows.filter((x) => norm(x.name) === norm(r.name)).forEach((x) => (x.typeId = typeId));
        }
        const mk = r.date.slice(0, 7);
        if (!reports[mk]) {
          const { data, error } = await supabase.rpc("get_or_create_report", { p_org: org.id, p_month: mk + "-01" });
          if (error) throw error; reports[mk] = data as Report;
        }
        const { error } = await supabase.from("entries").insert({ report_id: reports[mk].id, org_id: org.id, entry_date: r.date, waste_type_id: typeId, quantity: r.quantity, source });
        if (error) throw error;
        ok++;
      } catch (e) { fail++; lastErr = errText(e, lang); }
    }
    setBusy(""); setRows([]);
    setMsg(`Импортировано записей: ${ok}${fail ? `. Не удалось: ${fail} (${lastErr})` : ""}`);
  }

  if (!org) return <div className="card text-clay">{t("noOrg")}</div>;
  const active = rows.filter((x) => !x.skip);

  return (
    <>
      <Link href="/entry" className="mb-3 inline-block text-[14px] font-semibold text-leaf">← {t("navEntry")}</Link>
      <h1 className="h1 mb-1">{lang === "kk" ? "Импорт" : "Импорт данных"}</h1>
      <p className="mb-4 text-[14px] text-mute">{nm(org, lang)}</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <button type="button" className="card text-left transition hover:border-leaf" onClick={() => xlsRef.current?.click()}>
          <div className="h2">📊 Excel</div>
          <p className="text-[14px] text-mute">{lang === "kk" ? "Қолданыстағы кестені (.xlsx) жүктеу" : "Загрузить действующую таблицу учёта (.xlsx)"}</p>
        </button>
        <button type="button" className="card text-left transition hover:border-leaf" onClick={() => imgRef.current?.click()}>
          <div className="h2">📷 {lang === "kk" ? "Қағаз бланк" : "Фото бумажного бланка"}</div>
          <p className="text-[14px] text-mute">{lang === "kk" ? "ЖИ бланк жолдарын тани алады (OCR)" : "ИИ распознает строки заполненного бланка (OCR)"}</p>
        </button>
        <input ref={xlsRef} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onExcel(f); e.target.value = ""; }} />
        <input ref={imgRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ""; }} />
      </div>
      {busy && <p className="mb-3 rounded-xl bg-amber/15 px-3 py-2 text-[14px] font-medium text-[#8a5a00]">{busy}</p>}
      {msg && <p className="mb-3 rounded-xl bg-mint px-3 py-2 text-[14px] font-medium text-pine">{msg}</p>}

      {rows.length > 0 && (
        <>
          <div className="card mb-3 overflow-x-auto !p-0">
            <table className="w-full min-w-[620px]">
              <thead className="border-b border-line bg-cream/60"><tr><th className="th"></th><th className="th">{t("date")}</th><th className="th">{lang === "kk" ? "Кестеде" : "В таблице"}</th><th className="th">{t("wasteType")}</th><th className="th text-right">{t("quantity")}</th></tr></thead>
              <tbody className="divide-y divide-line/70">
                {rows.map((r, i) => (
                  <tr key={i} className={r.skip ? "opacity-40" : ""}>
                    <td className="td"><input type="checkbox" className="h-5 w-5 accent-[#1f7a4d]" checked={!r.skip} onChange={() => setRows(rows.map((x, k) => (k === i ? { ...x, skip: !x.skip } : x)))} aria-label="import" /></td>
                    <td className="td num whitespace-nowrap">{r.date ? dateRu(r.date) : "—"}</td>
                    <td className="td text-mute">{r.name}</td>
                    <td className="td">
                      <select className="field !min-h-9 !text-[14px]" value={r.typeId ?? ""} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, typeId: e.target.value || null } : x)))}>
                        <option value="">+ {lang === "kk" ? "жаңа түр" : "новый вид"}: {r.name}</option>
                        {types.map((x) => <option key={x.id} value={x.id}>{nm(x, lang)}</option>)}
                      </select>
                    </td>
                    <td className="td num text-right font-semibold">{r.quantity} {t(typeById[r.typeId ?? ""]?.unit ?? "kg")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-primary w-full" disabled={!!busy || active.length === 0} onClick={run}>{lang === "kk" ? "Импорттау" : "Импортировать"} · {active.length} {t("entriesCount")}</button>
        </>
      )}
    </>
  );
}

export default function ImportPage() {
  return <Shell roles={["responsible"]}><ImportInner /></Shell>;
}
