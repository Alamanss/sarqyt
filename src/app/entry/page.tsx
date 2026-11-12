"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Shell, StatusBadge } from "@/components/Shell";
import { useAuth } from "@/lib/auth";
import { useI18n, nm, monthName, dateRu } from "@/lib/i18n";
import { supabase, today, fmt, type Disposal, type Entry, type History, type Report, type WasteType } from "@/lib/supabase";
import { api, errText } from "@/lib/data";

const MAX_QTY = 500; // разумный верхний предел одной записи, кг/л

function EntryInner() {
  const { profile, org } = useAuth();
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const month = params.get("m") || today().slice(0, 7);
  const isCurrentMonth = month === today().slice(0, 7);
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const maxDate = isCurrentMonth ? today() : `${month}-${String(lastDay).padStart(2, "0")}`;

  const [report, setReport] = useState<Report | null>(null);
  const [types, setTypes] = useState<WasteType[]>([]);
  const [disposals, setDisposals] = useState<Disposal[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lastReturn, setLastReturn] = useState<History | null>(null);
  const [date, setDate] = useState(maxDate);
  const [typeId, setTypeId] = useState("");
  const [qty, setQty] = useState("");
  const [dispId, setDispId] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState<"kg" | "l">("kg");
  const [newRec, setNewRec] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null); // dataURL для прикрепления
  const [ai, setAi] = useState<string | null>(null);
  const [source, setSource] = useState("web");
  const fileRef = useRef<HTMLInputElement>(null);
  const draftKey = org ? `zw-draft-${org.id}` : "";

  const load = useCallback(async () => {
    if (!org) return;
    const { data: rep, error } = await supabase.rpc("get_or_create_report", { p_org: org.id, p_month: `${month}-01` });
    if (error) { setMsg({ kind: "err", text: errText(error, lang) }); return; }
    const r = rep as Report;
    setReport(r);
    const [w, d, e, h] = await Promise.all([
      supabase.from("waste_types").select("*").or(`org_id.eq.${org.id},org_id.is.null`).eq("active", true).order("created_at"),
      supabase.from("disposal_methods").select("*").order("name_ru"),
      supabase.from("entries").select("*").eq("report_id", r.id).order("created_at", { ascending: false }),
      supabase.from("status_history").select("*").eq("report_id", r.id).eq("to_status", "returned").order("created_at", { ascending: false }).limit(1),
    ]);
    setTypes((w.data ?? []) as WasteType[]);
    setDisposals((d.data ?? []) as Disposal[]);
    setEntries((e.data ?? []) as Entry[]);
    setLastReturn(((h.data ?? [])[0] as History) ?? null);
  }, [org, month, lang]);

  useEffect(() => { load(); }, [load]);

  // автосохранение черновика формы
  useEffect(() => {
    if (!draftKey) return;
    try {
      const s = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (s && (s.typeId || s.qty)) { setTypeId(s.typeId || ""); setQty(s.qty || ""); setDispId(s.dispId || ""); setMsg({ kind: "info", text: t("draftRestored") }); }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ typeId, qty, dispId })); } catch {}
  }, [draftKey, typeId, qty, dispId]);

  const typeById = useMemo(() => Object.fromEntries(types.map((x) => [x.id, x])), [types]);
  const dispById = useMemo(() => Object.fromEntries(disposals.map((x) => [x.id, x])), [disposals]);
  const cur = typeById[typeId];
  const editable = !!report && (report.status === "draft" || report.status === "returned");

  function pickType(id: string) {
    setTypeId(id);
    const tp = typeById[id];
    if (tp?.default_disposal_id) setDispId(tp.default_disposal_id);
  }

  async function save() {
    if (!report || !org) return;
    const q = Number(String(qty).replace(",", "."));
    if (!typeId || !date || !qty) return setMsg({ kind: "err", text: t("errRequired") });
    if (!(q > 0)) return setMsg({ kind: "err", text: t("errPositive") });
    if (q > MAX_QTY) return setMsg({ kind: "err", text: t("errTooBig") });
    if (date > today()) return setMsg({ kind: "err", text: t("errFuture") });
    const dup = entries.some((e) => e.entry_date === date && e.waste_type_id === typeId && Number(e.quantity) === q);
    if (dup && !confirm(t("dupWarn"))) return;
    setBusy(true);
    let photo_url: string | null = null;
    if (photo) {
      try {
        const blob = await (await fetch(photo)).blob();
        const path = `${org.id}/${Date.now()}.jpg`;
        const up = await supabase.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
        if (!up.error) photo_url = supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
      } catch {}
    }
    const { error } = await supabase.from("entries").insert({
      report_id: report.id, org_id: org.id, entry_date: date, waste_type_id: typeId, quantity: q,
      disposal_id: dispId || null, photo_url, source,
    });
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: errText(error, lang) });
    setQty(""); setPhoto(null); setAi(null); setSource("web");
    try { localStorage.removeItem(draftKey); } catch {}
    setMsg({ kind: "ok", text: t("saved") });
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) setMsg({ kind: "err", text: errText(error, lang) });
    load();
  }

  async function addType() {
    if (!org || !newName.trim()) return;
    const { data, error } = await supabase.from("waste_types").insert({
      org_id: org.id, name_ru: newName.trim(), name_kk: newName.trim(), unit: newUnit, recyclable: newRec,
      default_disposal_id: dispId || disposals.find((d) => d.code === "TBO")?.id || disposals[0]?.id || null, co2_factor: 0.70021,
    }).select().single();
    if (error) return setMsg({ kind: "err", text: errText(error, lang) });
    setAddOpen(false); setNewName("");
    await load();
    setTypeId((data as WasteType).id);
  }

  async function submit() {
    if (!report || !confirm(t("submitConfirm"))) return;
    const { error } = await supabase.rpc("submit_report", { p_report: report.id });
    if (error) return setMsg({ kind: "err", text: errText(error, lang) });
    setMsg(null);
    load();
  }

  // фото → ИИ определяет вид отхода
  async function onPhoto(file: File) {
    setAi(t("aiThinking"));
    const dataUrl = await shrink(file, 1024);
    setPhoto(dataUrl);
    try {
      const j = await api("/api/ai/recognize", { image: dataUrl, types: types.map((x) => ({ id: x.id, name: x.name_ru })) });
      if (j.typeId && typeById[j.typeId]) {
        pickType(j.typeId); setSource("photo");
        setAi(`${t("aiGuess")}: ${nm(typeById[j.typeId], lang)}${j.confidence ? ` (${Math.round(j.confidence * 100)}%)` : ""}`);
      } else setAi(j.suggest ? `${t("aiGuess")}: «${j.suggest}» — ${t("addType").replace("+ ", "").toLowerCase()}?` : null);
      if (!j.typeId && j.suggest) { setNewName(j.suggest); setAddOpen(true); }
    } catch { setAi(null); }
  }

  // голос → ИИ разбирает «три кило очистков»
  function voice() {
    type SR = { lang: string; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; onerror: () => void; start: () => void };
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return setMsg({ kind: "err", text: "Голосовой ввод не поддерживается этим браузером" });
    const r = new Ctor();
    r.lang = lang === "kk" ? "kk-KZ" : "ru-RU";
    setAi("🎙 …");
    r.onerror = () => setAi(null);
    r.onresult = async (e) => {
      const text = e.results[0][0].transcript;
      setAi(`🎙 «${text}»`);
      try {
        const j = await api("/api/ai/parse", { text, types: types.map((x) => ({ id: x.id, name: x.name_ru })) });
        if (j.typeId && typeById[j.typeId]) pickType(j.typeId);
        if (j.quantity > 0) setQty(String(j.quantity));
        setSource("voice");
      } catch {}
    };
    r.start();
  }

  // итоги
  const sum = (list: Entry[]) => {
    const by: Record<string, number> = {}; let kg = 0, l = 0;
    for (const e of list) {
      by[e.waste_type_id] = (by[e.waste_type_id] || 0) + Number(e.quantity);
      if (typeById[e.waste_type_id]?.unit === "l") l += Number(e.quantity); else kg += Number(e.quantity);
    }
    return { by, kg, l };
  };
  const dayEntries = entries.filter((e) => e.entry_date === date);
  const day = sum(dayEntries), mon = sum(entries);

  if (!org) return <div className="card text-clay">{t("noOrg")}</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section className="card h-fit">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h1 className="h2">{nm(org, lang)}</h1>
            <p className="text-[13px] capitalize text-mute">{monthName(month + "-01", lang)}</p>
          </div>
          {report && <StatusBadge status={report.status} />}
        </div>

        {report?.status === "returned" && lastReturn?.comment && (
          <div className="mb-3 rounded-xl border border-clay/30 bg-clay/10 p-3 text-[14px]">
            <b className="block text-clay">{t("reviewerComment")}</b>{lastReturn.comment}
          </div>
        )}
        {!editable && report && <div className="mb-3 rounded-xl bg-mint p-3 text-[14px] font-medium text-pine">{t("locked")}</div>}

        {editable && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                {t("photoAi")}
              </button>
              <button type="button" className="btn-ghost" onClick={voice}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
                {t("voice")}
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ""; }} />
            </div>
            {(ai || photo) && (
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-mint p-2 text-[13px] font-medium text-pine">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photo && <img src={photo} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                <span>{ai}</span>
              </div>
            )}

            <label className="label" htmlFor="wt">{t("wasteType")}</label>
            <select id="wt" className="field mb-1" value={typeId} onChange={(e) => pickType(e.target.value)}>
              <option value="">—</option>
              {types.map((x) => <option key={x.id} value={x.id}>{nm(x, lang)} ({t(x.unit)})</option>)}
            </select>
            {!addOpen ? (
              <button type="button" className="mb-3 text-[13px] font-semibold text-leaf" onClick={() => setAddOpen(true)}>{t("addType")}</button>
            ) : (
              <div className="mb-3 rounded-xl border border-line bg-cream p-3">
                <label className="label" htmlFor="nn">{t("newTypeName")}</label>
                <input id="nn" className="field mb-2" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                <div className="mb-2 flex items-center gap-3 text-[14px]">
                  <select className="field !w-24" value={newUnit} onChange={(e) => setNewUnit(e.target.value as "kg" | "l")} aria-label={t("unit")}>
                    <option value="kg">{t("kg")}</option><option value="l">{t("l")}</option>
                  </select>
                  <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[#1f7a4d]" checked={newRec} onChange={(e) => setNewRec(e.target.checked)} />{t("recyclable")}</label>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary flex-1" onClick={addType}>{t("add")}</button>
                  <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>{t("cancel")}</button>
                </div>
              </div>
            )}

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="q">{cur?.unit === "l" ? t("volumeL") : t("weightKg")}</label>
                <input id="q" className="field num text-xl font-bold" inputMode="decimal" placeholder="0,0" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.,]/g, ""))} />
              </div>
              <div>
                <label className="label" htmlFor="d">{t("date")}</label>
                <input id="d" className="field" type="date" value={date} min={`${month}-01`} max={maxDate} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <label className="label" htmlFor="dm">{t("disposal")}</label>
            <select id="dm" className="field mb-3" value={dispId} onChange={(e) => setDispId(e.target.value)}>
              <option value="">—</option>
              {disposals.map((x) => <option key={x.id} value={x.id}>{nm(x, lang)}</option>)}
            </select>

            {cur?.recommended_disposal_id && cur.recommended_disposal_id !== dispId && dispById[cur.recommended_disposal_id] && (
              <button type="button" onClick={() => setDispId(cur.recommended_disposal_id!)} className="mb-3 -mt-1 block w-full rounded-xl bg-mint px-3 py-2 text-left text-[13px] text-pine">
                ♻ {lang === "kk" ? "Ұсынылады" : "Рекомендуется"}: <b>{nm(dispById[cur.recommended_disposal_id], lang)}</b>
                <span className="text-mute"> · −{Math.round(Number(cur.co2_landfill ?? 0) - Number(cur.co2_recommended ?? 0))} кг CO₂e/т</span>
              </button>
            )}
            <p className="mb-3 text-[13px] text-mute">{t("responsible")}: <b className="text-ink">{profile?.full_name}</b></p>
            <button type="button" className="btn-primary w-full text-base" onClick={save} disabled={busy}>{t("save")}</button>
          </>
        )}
        {msg && (
          <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-[14px] font-medium ${msg.kind === "err" ? "bg-clay/10 text-clay" : msg.kind === "ok" ? "bg-mint text-leaf" : "bg-amber/15 text-[#8a5a00]"}`}>{msg.text}</p>
        )}
      </section>

      <section className="grid h-fit gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Totals title={`${t("totalsDay")} · ${dateRu(date)}`} s={day} types={typeById} />
          <Totals title={`${t("totalsMonth")} · ${monthName(month + "-01", lang, false)}`} s={mon} types={typeById} strong />
        </div>

        <div className="card">
          <h2 className="h2 mb-2">{t("entriesToday")} · {dateRu(date)}</h2>
          {dayEntries.length === 0 ? <p className="text-[14px] text-mute">{t("noEntries")}</p> : (
            <ul className="divide-y divide-line">
              {dayEntries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {e.photo_url && <a href={e.photo_url} target="_blank" rel="noreferrer"><img src={e.photo_url} alt="" className="h-10 w-10 rounded-lg object-cover" /></a>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{nm(typeById[e.waste_type_id], lang)}</div>
                    <div className="truncate text-[12px] text-mute">{nm(dispById[e.disposal_id ?? ""], lang)}{e.source !== "web" ? ` · ${e.source}` : ""}</div>
                  </div>
                  <div className="num text-[15px] font-bold">{fmt(Number(e.quantity))} {t(typeById[e.waste_type_id]?.unit ?? "kg")}</div>
                  {editable && <button type="button" onClick={() => remove(e.id)} aria-label={t("delete")} className="grid h-9 w-9 place-items-center rounded-lg text-mute hover:bg-clay/10 hover:text-clay">✕</button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {editable && (
          <button type="button" className="btn-dark w-full" onClick={submit} disabled={entries.length === 0}>
            {t("submitReport")} · {entries.length} {t("entriesCount")}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link href="/import" className="btn-ghost">📊 {lang === "kk" ? "Excel / бланк импорты" : "Импорт Excel / бланка"}</Link>
          <button type="button" className="btn-ghost" onClick={async () => { const j = await api("/api/telegram/link", {}); if (j.url) window.open(j.url, "_blank"); else setMsg({ kind: "err", text: j.error ?? "Telegram" }); }}>✈ Telegram-бот</button>
        </div>
      </section>
    </div>
  );
}

function Totals({ title, s, types, strong }: { title: string; s: { by: Record<string, number>; kg: number; l: number }; types: Record<string, WasteType>; strong?: boolean }) {
  const { t, lang } = useI18n();
  const rows = Object.entries(s.by).sort((a, b) => b[1] - a[1]);
  return (
    <div className={`card ${strong ? "!bg-pine !text-white" : ""}`}>
      <h2 className={`mb-2 text-[13px] font-semibold uppercase tracking-wide ${strong ? "text-white/60" : "text-mute"}`}>{title}</h2>
      <div className="num text-3xl font-bold">{fmt(s.kg)} <span className="text-base font-semibold opacity-70">{t("kg")}</span>
        {s.l > 0 && <span className="ml-3 text-xl">{fmt(s.l)} <span className="text-sm opacity-70">{t("l")}</span></span>}
      </div>
      <ul className="mt-2 space-y-0.5 text-[13px]">
        {rows.map(([id, v]) => (
          <li key={id} className="flex justify-between gap-2">
            <span className="truncate opacity-80">{nm(types[id], lang)}</span>
            <span className="num font-semibold">{fmt(v)} {t(types[id]?.unit ?? "kg")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function shrink(file: File, max: number): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export default function EntryPage() {
  return <Shell roles={["responsible"]}><Suspense><EntryInner /></Suspense></Shell>;
}
