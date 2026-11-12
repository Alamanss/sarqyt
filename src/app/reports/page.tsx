"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, CornerUpLeft, MessageSquareWarning, PenLine } from "lucide-react";
import { PageHead, Shell, StatusBadge } from "@/components/Shell";
import { useAuth } from "@/lib/auth";
import { useI18n, nm, monthName, dateRu, entriesLabel, type Key } from "@/lib/i18n";
import { supabase, fmt, type Disposal, type Entry, type History, type Org, type Profile, type Report, type WasteType } from "@/lib/supabase";
import { errText, loadRefs, loadReports } from "@/lib/data";

function List() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const [reports, setReports] = useState<Report[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"queue" | "all">("queue");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const [r, refs] = await Promise.all([loadReports(), loadRefs()]);
      setReports(r); setOrgs(refs.orgs);
      const c: Record<string, number> = {};
      await Promise.all(r.slice(0, 60).map(async (x) => {
        const { count } = await supabase.from("entries").select("id", { count: "exact", head: true }).eq("report_id", x.id);
        c[x.id] = count ?? 0;
      }));
      setCounts(c);
    })();
  }, []);

  const orgById = useMemo(() => Object.fromEntries(orgs.map((o) => [o.id, o])), [orgs]);
  const isResp = profile?.role === "responsible";
  const queue = reports.filter((r) => r.status === "submitted" || r.status === "in_review");
  const shown = isResp || filter === "all" ? reports : queue;

  return (
    <>
      <PageHead title={isResp ? t("myReports") : t("navReports")} sub={lang === "kk" ? "Ұйымдардың айлық есептері" : "Месячные отчёты организаций и их статусы"}>
        {!isResp && (
          <div className="seg">
            <button type="button" onClick={() => setFilter("queue")} className={filter === "queue" ? "seg-on" : "seg-off"}>{t("queue")} <span className="num ml-1 rounded bg-[#fdf3dc] px-1.5 text-[12px] text-[#8a5a00]">{queue.length}</span></button>
            <button type="button" onClick={() => setFilter("all")} className={filter === "all" ? "seg-on" : "seg-off"}>{t("allReports")}</button>
          </div>
        )}
      </PageHead>
      {shown.length === 0 ? <div className="card py-10 text-center text-[14px] text-mute">{lang === "kk" ? "Тексеруді күтіп тұрған есеп жоқ" : "Нет отчётов, ожидающих проверки"}</div> : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[560px]">
            <thead className="border-b border-line bg-wash"><tr>
              <th className="th">{t("period")}</th><th className="th">{t("organization")}</th><th className="th">{t("status")}</th><th className="th text-right">{lang === "kk" ? "Жазбалар" : "Записей"}</th><th className="th">{lang === "kk" ? "Жіберілді" : "Отправлен"}</th><th className="th w-8"></th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => router.push(`/reports?id=${r.id}`)}>
                  <td className="td font-semibold first-letter:uppercase"><Link href={`/reports?id=${r.id}`}>{monthName(r.period_start, lang)}</Link></td>
                  <td className="td text-ink">{nm(orgById[r.org_id], lang)}</td>
                  <td className="td"><StatusBadge status={r.status} /></td>
                  <td className="td num text-right">{counts[r.id] ?? "…"}</td>
                  <td className="td num text-mute">{r.submitted_at ? dateRu(r.submitted_at.slice(0, 10)) : "—"}</td>
                  <td className="td text-faint"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Detail({ id }: { id: string }) {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [refs, setRefs] = useState<{ orgs: Org[]; types: WasteType[]; disposals: Disposal[] }>({ orgs: [], types: [], disposals: [] });
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const canReview = profile?.role === "reviewer" || profile?.role === "admin";

  const load = useCallback(async () => {
    const [{ data: rep }, e, h, rf, pp] = await Promise.all([
      supabase.from("reports").select("*").eq("id", id).maybeSingle(),
      supabase.from("entries").select("*").eq("report_id", id).order("entry_date").order("created_at").limit(2000),
      supabase.from("status_history").select("*").eq("report_id", id).order("created_at"),
      loadRefs(),
      supabase.from("profiles").select("*"),
    ]);
    let r = rep as Report | null;
    // проверяющий открыл отправленный отчёт → «на проверке»
    if (r && r.status === "submitted" && (profile?.role === "reviewer" || profile?.role === "admin")) {
      const { data } = await supabase.rpc("start_review", { p_report: id });
      if (data) r = data as Report;
      const h2 = await supabase.from("status_history").select("*").eq("report_id", id).order("created_at");
      setHistory((h2.data ?? []) as History[]);
    } else setHistory((h.data ?? []) as History[]);
    setReport(r); setEntries((e.data ?? []) as Entry[]); setRefs(rf);
    setPeople(Object.fromEntries(((pp.data ?? []) as Profile[]).map((p) => [p.id, p])));
  }, [id, profile?.role]);

  useEffect(() => { load(); }, [load]);

  const typeById = useMemo(() => Object.fromEntries(refs.types.map((x) => [x.id, x])), [refs.types]);
  const dispById = useMemo(() => Object.fromEntries(refs.disposals.map((x) => [x.id, x])), [refs.disposals]);
  const org = refs.orgs.find((o) => o.id === report?.org_id);

  async function decide(accept: boolean) {
    if (!accept && !comment.trim()) return setErr(t("commentRequired"));
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("decide_report", { p_report: id, p_accept: accept, p_comment: comment });
    setBusy(false);
    if (error) return setErr(errText(error, lang));
    setComment(""); load();
  }

  if (!report) return <div className="text-mute">{t("loading")}</div>;

  const totals: Record<string, number> = {};
  let kg = 0, l = 0;
  for (const e of entries) {
    totals[e.waste_type_id] = (totals[e.waste_type_id] || 0) + Number(e.quantity);
    if (typeById[e.waste_type_id]?.unit === "l") l += Number(e.quantity); else kg += Number(e.quantity);
  }
  const mine = profile?.role === "responsible";
  const editable = report.status === "draft" || report.status === "returned";
  const lastReturn = [...history].reverse().find((h) => h.to_status === "returned");

  return (
    <>
      <button type="button" onClick={() => router.push("/reports")} className="link mb-4"><ArrowLeft className="h-3.5 w-3.5" />{t("navReports")}</button>
      <PageHead title={<span className="inline-block first-letter:uppercase">{monthName(report.period_start, lang)}</span>} sub={<>{nm(org, lang)} · <span className="num">{dateRu(report.period_start)} – {dateRu(report.period_end)}</span> · {entriesLabel(entries.length, lang)}</>}>
        <StatusBadge status={report.status} />
      </PageHead>

      {mine && report.status === "returned" && lastReturn?.comment && (
        <div className="note note-err mb-4 flex gap-2.5"><MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" /><span><b className="block font-semibold">{t("reviewerComment")}</b>{lastReturn.comment}</span></div>
      )}
      {mine && editable && (
        <Link href={`/entry?m=${report.period_start.slice(0, 7)}`} className="btn-primary mb-6"><PenLine className="h-4 w-4" />{lang === "kk" ? "Жазбаларды түзету" : "Исправить записи"}</Link>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid h-fit gap-4">
          <div className="card">
            <div className="mb-3 flex items-baseline justify-between"><h2 className="h2">{t("totalsMonth")}</h2><span className="num text-[15px] font-semibold">{fmt(kg)} {t("kg")}{l > 0 ? ` + ${fmt(l)} ${t("l")}` : ""}</span></div>
            <ul className="grid gap-x-8 text-[14px] sm:grid-cols-2">
              {Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([tid, v]) => (
                <li key={tid} className="flex justify-between gap-2 border-b border-line py-1.5">
                  <span className="truncate text-ink">{nm(typeById[tid], lang)}</span>
                  <b className="num font-semibold">{fmt(v)} {t(typeById[tid]?.unit ?? "kg")}</b>
                </li>
              ))}
            </ul>
          </div>
          <div className="card overflow-x-auto !p-0">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-line bg-wash"><tr>
                <th className="th">{t("date")}</th><th className="th">{t("wasteType")}</th><th className="th text-right">{t("quantity")}</th><th className="th">{t("disposal")}</th><th className="th">{t("responsible")}</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="td num whitespace-nowrap">{dateRu(e.entry_date)}</td>
                    <td className="td">
                      <span className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {e.photo_url && <a href={e.photo_url} target="_blank" rel="noreferrer"><img src={e.photo_url} alt="" className="h-8 w-8 rounded-md object-cover" /></a>}
                        {nm(typeById[e.waste_type_id], lang)}
                      </span>
                    </td>
                    <td className="td num text-right font-semibold whitespace-nowrap">{fmt(Number(e.quantity))} {t(typeById[e.waste_type_id]?.unit ?? "kg")}</td>
                    <td className="td text-mute">{nm(dispById[e.disposal_id ?? ""], lang)}</td>
                    <td className="td text-mute">{people[e.responsible_id ?? ""]?.full_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="grid h-fit gap-4">
          {canReview && (report.status === "submitted" || report.status === "in_review") && (
            <div className="card">
              <h2 className="h2 mb-3">{lang === "kk" ? "Шешім" : "Решение по отчёту"}</h2>
              <label className="label" htmlFor="c">{t("comment")}</label>
              <textarea id="c" className="field mb-3 min-h-24 py-2" value={comment} onChange={(e) => setComment(e.target.value)} />
              {err && <p className="note note-err mb-3" role="alert">{err}</p>}
              <div className="grid gap-3">
                <button type="button" className="btn-primary" disabled={busy} onClick={() => decide(true)}><Check className="h-4 w-4" />{t("accept")}</button>
                <button type="button" className="btn-danger" disabled={busy} onClick={() => decide(false)}><CornerUpLeft className="h-4 w-4" />{t("returnBack")}</button>
              </div>
            </div>
          )}
          <div className="card">
            <h2 className="h2 mb-3">{t("history")}</h2>
            <ol className="relative space-y-4 border-l border-line pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-[7px] h-2 w-2 rounded-full bg-faint ring-4 ring-paper" />
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={h.to_status} /><span className="num text-[12px] text-mute">{new Date(h.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div>
                  <div className="mt-1 text-[14px] text-mute">{people[h.user_id ?? ""]?.full_name ?? "—"}{people[h.user_id ?? ""] ? ` · ${t(("role_" + people[h.user_id ?? ""].role) as Key)}` : ""}</div>
                  {h.comment && <div className="mt-1.5 rounded-md border border-line bg-wash px-2.5 py-1.5 text-[14px]">{h.comment}</div>}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}

function Inner() {
  const id = useSearchParams().get("id");
  return id ? <Detail id={id} /> : <List />;
}

export default function ReportsPage() {
  return <Shell><Suspense><Inner /></Suspense></Shell>;
}
