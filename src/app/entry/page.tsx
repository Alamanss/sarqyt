"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Camera, Check, FileSpreadsheet, Leaf, Lock, MessageSquareWarning, Mic, Plus, Send, SendHorizontal, Sparkles, Trash2 } from "lucide-react";
import { PageHead, Shell, StatusBadge } from "@/components/Shell";
import { useAuth } from "@/lib/auth";
import { useI18n, nm, monthName, dateRu, entriesLabel } from "@/lib/i18n";
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
      if (s && (s.typeId || s.qty)) { setTypeId(s.typeId || ""); setQty(s.qty || ""); setDispId(s.dispId || ""); if (s.qty) setMsg({ kind: "info", text: t("draftRestored") }); }
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
    setAi(lang === "kk" ? "Тыңдап тұрмын…" : "Слушаю…");
    r.onerror = () => setAi(null);
    r.onresult = async (e) => {
      const text = e.results[0][0].transcript;
      setAi(`«${text}»`);
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

  const STEPS = ["draft", "submitted", "in_review", "accepted"] as const;
  const stepIdx = report ? (report.status === "returned" ? 0 : STEPS.indexOf(report.status as (typeof STEPS)[number])) : 0;

  return (
    <>
      <PageHead title={t("newEntry")} sub={<span className="inline-block first-letter:uppercase">{monthName(month + "-01", lang)} · {nm(org, lang)}</span>}>
        {report && <StatusBadge status={report.status} />}
      </PageHead>

      {/* дорожка статусов отчёта */}
      <ol className="mb-6 flex items-center gap-1.5 overflow-x-auto text-[12px] [scrollbar-width:none] sm:gap-2 sm:text-[14px]">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5 whitespace-nowrap sm:gap-2">
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[12px] ${i < stepIdx ? "bg-leaf text-white" : i === stepIdx ? "bg-ink text-white" : "border border-[#c9cfda] bg-paper text-faint"}`}>
              {i < stepIdx ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={i === stepIdx ? "font-semibold text-ink" : "text-mute"}>{t(("st_" + s) as "st_draft")}</span>
            {i < STEPS.length - 1 && <span className="h-px w-3 bg-line sm:w-10" />}
          </li>
        ))}
      </ol>

      {report?.status === "returned" && lastReturn?.comment && (
        <div className="note note-err mb-4 flex gap-2.5">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b className="block font-semibold">{t("reviewerComment")}</b>{lastReturn.comment}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr]">
        <section className="card h-fit !p-0">
          {!editable && report ? (
            <div className="flex items-center gap-2.5 p-5 text-[14px] text-mute"><Lock className="h-4 w-4" />{t("locked")}</div>
          ) : (
            <>
              <div className="border-b border-line p-4 md:p-6">
                <label className="label" htmlFor="q">{cur?.unit === "l" ? t("volumeL") : t("weightKg")}</label>
                <div className="relative">
                  <input id="q" className="field num !h-[72px] !pr-14 !text-[36px] font-semibold tracking-[-0.02em]" inputMode="decimal" placeholder="0,0" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.,]/g, ""))} />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-faint">{t(cur?.unit ?? "kg")}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4 text-mute" />{t("photoAi")}</button>
                  <button type="button" className="btn-ghost" onClick={voice}><Mic className="h-4 w-4 text-mute" />{t("voice")}</button>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ""; }} />
                </div>
                {(ai || photo) && (
                  <div className="note note-ok mt-3 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photo ? <img src={photo} alt="" className="h-11 w-11 rounded-md object-cover" /> : <Sparkles className="h-4 w-4 shrink-0" />}
                    <span>{ai}</span>
                  </div>
                )}
              </div>

              <div className="p-4 md:p-6">
                <label className="label" htmlFor="wt">{t("wasteType")}</label>
                <select id="wt" className="field" value={typeId} onChange={(e) => pickType(e.target.value)}>
                  <option value="">{lang === "kk" ? "Тізімнен таңдаңыз" : "Выберите из списка"}</option>
                  {types.map((x) => <option key={x.id} value={x.id}>{nm(x, lang)} ({t(x.unit)})</option>)}
                </select>
                {!addOpen ? (
                  <button type="button" className="link mt-3 mb-5" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5" />{t("addType").replace("+ ", "")}</button>
                ) : (
                  <div className="mt-2 mb-4 rounded-lg border border-line bg-wash p-3">
                    <label className="label" htmlFor="nn">{t("newTypeName")}</label>
                    <input id="nn" className="field mb-2.5" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                    <div className="mb-3 flex items-center gap-3 text-[14px]">
                      <select className="field !w-24" value={newUnit} onChange={(e) => setNewUnit(e.target.value as "kg" | "l")} aria-label={t("unit")}>
                        <option value="kg">{t("kg")}</option><option value="l">{t("l")}</option>
                      </select>
                      <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#16192c]" checked={newRec} onChange={(e) => setNewRec(e.target.checked)} />{t("recyclable")}</label>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn-primary flex-1" onClick={addType}>{t("add")}</button>
                      <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>{t("cancel")}</button>
                    </div>
                  </div>
                )}

                <label className="label" htmlFor="dm">{t("disposal")}</label>
                <select id="dm" className="field" value={dispId} onChange={(e) => setDispId(e.target.value)}>
                  <option value="">{lang === "kk" ? "Тізімнен таңдаңыз" : "Выберите из списка"}</option>
                  {disposals.map((x) => <option key={x.id} value={x.id}>{nm(x, lang)}</option>)}
                </select>
                {cur?.recommended_disposal_id && cur.recommended_disposal_id !== dispId && dispById[cur.recommended_disposal_id] && (
                  <button type="button" onClick={() => setDispId(cur.recommended_disposal_id!)} className="mt-2 flex w-full items-start gap-2 rounded-lg bg-mint px-3 py-2 text-left text-[14px] text-leafdark transition hover:bg-[#d9efe6]">
                    <Leaf className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{lang === "kk" ? "Ұсынылады" : "Рекомендуется"}: <b className="font-semibold">{nm(dispById[cur.recommended_disposal_id], lang)}</b> · −{Math.round(Number(cur.co2_landfill ?? 0) - Number(cur.co2_recommended ?? 0))} кг CO₂e/т</span>
                  </button>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="d">{t("date")}</label>
                    <input id="d" className="field" type="date" value={date} min={`${month}-01`} max={maxDate} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="min-w-0">
                    <span className="label">{t("responsible")}</span>
                    <div className="flex h-11 items-center rounded-lg border border-line bg-wash px-3 text-[14px] text-mute max-md:h-12"><span className="truncate">{profile?.full_name}</span></div>
                  </div>
                </div>

                <div className="mt-6 max-md:sticky max-md:bottom-[68px] max-md:z-10 max-md:-mx-4 max-md:-mb-4 max-md:rounded-b-xl max-md:border-t max-md:border-line max-md:bg-paper max-md:p-3">
                  <button type="button" className="btn-primary w-full !min-h-12" onClick={save} disabled={busy}>{t("save")}</button>
                </div>
              </div>
            </>
          )}
          {msg && (
            <p role="status" className={`note mx-4 mb-4 md:mx-6 md:mb-6 ${msg.kind === "err" ? "note-err" : msg.kind === "ok" ? "note-ok" : "note-info"}`}>{msg.text}</p>
          )}
        </section>

        <section className="grid h-fit gap-6">
          <div className="card grid grid-cols-2 !p-0">
            <Totals title={`${t("totalsDay")} · ${dateRu(date)}`} s={day} types={typeById} />
            <Totals title={`${t("totalsMonth")} · ${monthName(month + "-01", lang, false)}`} s={mon} types={typeById} second />
          </div>

          <div className="card !p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-4 md:px-6">
              <h2 className="h2">{t("entriesToday")}</h2>
              <span className="num text-[14px] text-mute">{dateRu(date)} · {dayEntries.length}</span>
            </div>
            {dayEntries.length === 0 ? <p className="px-5 py-8 text-center text-[14px] text-mute">{t("noEntries")}</p> : (
              <ul className="divide-y divide-line">
                {dayEntries.map((e) => (
                  <li key={e.id} className="flex min-h-14 items-center gap-3 px-4 py-2 md:px-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {e.photo_url && <a href={e.photo_url} target="_blank" rel="noreferrer"><img src={e.photo_url} alt="" className="h-9 w-9 rounded-md object-cover" /></a>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">{nm(typeById[e.waste_type_id], lang)}</div>
                      <div className="flex items-center gap-1.5 text-[12px] text-mute">
                        <span className="truncate">{nm(dispById[e.disposal_id ?? ""], lang)}</span>
                        {e.source !== "web" && <span className="shrink-0 rounded bg-[#f0f2f5] px-1.5 py-px text-[12px] font-semibold text-[#545969]">{SRC[e.source] ?? e.source}</span>}
                      </div>
                    </div>
                    <div className="num whitespace-nowrap text-[14px] font-semibold">{fmt(Number(e.quantity))} <span className="font-normal text-mute">{t(typeById[e.waste_type_id]?.unit ?? "kg")}</span></div>
                    {editable && <button type="button" onClick={() => remove(e.id)} aria-label={t("delete")} className="grid h-11 w-11 place-items-center rounded-lg text-faint hover:bg-wash hover:text-clay"><Trash2 className="h-4 w-4" /></button>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {editable && (
            <div className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="h2">{t("submitReport")}</div>
                <div className="text-[14px] text-mute">{entriesLabel(entries.length, lang)} · <span className="inline-block first-letter:uppercase">{monthName(month + "-01", lang)}</span></div>
              </div>
              <button type="button" className="btn-dark max-md:w-full" onClick={submit} disabled={entries.length === 0}><Send className="h-4 w-4" />{lang === "kk" ? "Жіберу" : "Отправить"}</button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-1">
            <span className="text-[14px] text-mute">{lang === "kk" ? "Басқа тәсілдер" : "Другие способы ввода"}</span>
            <Link href="/import" className="link"><FileSpreadsheet className="h-4 w-4" />{lang === "kk" ? "Excel немесе бланк" : "Excel или фото бланка"}</Link>
            <button type="button" className="link" onClick={async () => { const j = await api("/api/telegram/link", {}); if (j.url) window.open(j.url, "_blank"); else setMsg({ kind: "err", text: j.error ?? "Telegram" }); }}><SendHorizontal className="h-4 w-4" />Telegram-бот</button>
          </div>
        </section>
      </div>
    </>
  );
}

const SRC: Record<string, string> = { photo: "фото", voice: "голос", telegram: "Telegram", scale: "весы", import: "Excel", ocr: "бланк" };

function Totals({ title, s, types, second }: { title: string; s: { by: Record<string, number>; kg: number; l: number }; types: Record<string, WasteType>; second?: boolean }) {
  const { t, lang } = useI18n();
  const rows = Object.entries(s.by).sort((a, b) => b[1] - a[1]);
  return (
    <div className={`min-w-0 p-4 md:p-6 ${second ? "border-l border-line" : ""}`}>
      <div className="eyebrow truncate">{title}</div>
      <div className="num mt-1 text-[26px] font-semibold tracking-[-0.02em]">{fmt(s.kg)} <span className="text-[14px] font-normal text-mute">{t("kg")}</span>
        {s.l > 0 && <span className="ml-2 whitespace-nowrap text-[14px] font-semibold text-mute">+ {fmt(s.l)} {t("l")}</span>}
      </div>
      <ul className="mt-3 space-y-1 text-[14px]">
        {rows.slice(0, 6).map(([id, v]) => (
          <li key={id} className="flex justify-between gap-2">
            <span className="truncate text-mute">{nm(types[id], lang)}</span>
            <span className="num whitespace-nowrap font-semibold">{fmt(v)} {t(types[id]?.unit ?? "kg")}</span>
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
