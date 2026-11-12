"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Shell, StatusBadge } from "@/components/Shell";
import { useAuth } from "@/lib/auth";
import { useI18n, nm, monthName, dateRu, type Key } from "@/lib/i18n";
import { supabase, fmt, type Disposal, type Entry, type History, type Org, type Profile, type Report, type WasteType } from "@/lib/supabase";
import { errText, loadRefs, loadReports } from "@/lib/data";

function List() {
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const [reports, setReports] = useState<Report[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"queue" | "all">("queue");

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">{isResp ? t("myReports") : t("navReports")}</h1>
        {!isResp && (
          <div className="inline-flex rounded-xl border border-line bg-paper p-1 text-[14px] font-semibold">
            <button type="button" onClick={() => setFilter("queue")} className={`rounded-lg px-3 py-1.5 ${filter === "queue" ? "bg-pine text-white" : "text-mute"}`}>{t("queue")} · {queue.length}</button>
            <button type="button" onClick={() => setFilter("all")} className={`rounded-lg px-3 py-1.5 ${filter === "all" ? "bg-pine text-white" : "text-mute"}`}>{t("allReports")}</button>
          </div>
        )}
      </div>
      {shown.length === 0 ? <div className="card text-mute">{t("noEntries")}</div> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => (
            <Link key={r.id} href={`/reports?id=${r.id}`} className="card transition hover:border-leaf hover:shadow-md">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="text-[15px] font-bold capitalize text-pine">{monthName(r.period_start, lang)}</div>
                <StatusBadge status={r.status} />
              </div>
              <div className="text-[14px]">{nm(orgById[r.org_id], lang)}</div>
              <div className="mt-2 text-[12px] text-mute">{counts[r.id] ?? "…"} {t("entriesCount")}{r.submitted_at ? ` · ${dateRu(r.submitted_at.slice(0, 10))}` : ""}</div>
            </Link>
          ))}
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
      <button type="button" onClick={() => router.push("/reports")} className="mb-3 text-[14px] font-semibold text-leaf">← {t("navReports")}</button>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="h1 capitalize">{monthName(report.period_start, lang)}</h1>
        <StatusBadge status={report.status} />
      </div>
      <p className="mb-4 text-[15px]">{nm(org, lang)} · <span className="text-mute">{dateRu(report.period_start)} – {dateRu(report.period_end)}</span></p>

      {mine && report.status === "returned" && lastReturn?.comment && (
        <div className="mb-4 rounded-2xl border border-clay/30 bg-clay/10 p-4">
          <b className="block text-clay">{t("reviewerComment")}</b>{lastReturn.comment}
        </div>
      )}
      {mine && editable && (
        <Link href={`/entry?m=${report.period_start.slice(0, 7)}`} className="btn-primary mb-4">{t("navEntry")} →</Link>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid h-fit gap-4">
          <div className="card">
            <h2 className="h2 mb-2">{t("totalsMonth")}: <span className="num">{fmt(kg)} {t("kg")}{l > 0 ? ` · ${fmt(l)} ${t("l")}` : ""}</span></h2>
            <ul className="grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
              {Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([tid, v]) => (
                <li key={tid} className="flex justify-between gap-2 border-b border-line/60 py-1">
                  <span className="truncate">{nm(typeById[tid], lang)}</span>
                  <b className="num">{fmt(v)} {t(typeById[tid]?.unit ?? "kg")}</b>
                </li>
              ))}
            </ul>
          </div>
          <div className="card overflow-x-auto !p-0">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-line bg-cream/60"><tr>
                <th className="th">{t("date")}</th><th className="th">{t("wasteType")}</th><th className="th text-right">{t("quantity")}</th><th className="th">{t("disposal")}</th><th className="th">{t("responsible")}</th>
              </tr></thead>
              <tbody className="divide-y divide-line/70">
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
            <div className="card border-leaf/40">
              <h2 className="h2 mb-2">{t("role_reviewer")}</h2>
              <label className="label" htmlFor="c">{t("comment")}</label>
              <textarea id="c" className="field mb-3 min-h-24 py-2" value={comment} onChange={(e) => setComment(e.target.value)} />
              {err && <p className="mb-3 rounded-xl bg-clay/10 px-3 py-2 text-[14px] font-medium text-clay">{err}</p>}
              <div className="grid gap-2">
                <button type="button" className="btn-primary" disabled={busy} onClick={() => decide(true)}>✓ {t("accept")}</button>
                <button type="button" className="btn-danger" disabled={busy} onClick={() => decide(false)}>↩ {t("returnBack")}</button>
              </div>
            </div>
          )}
          <div className="card">
            <h2 className="h2 mb-3">{t("history")}</h2>
            <ol className="relative space-y-4 border-l-2 border-line pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-paper bg-leaf" />
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={h.to_status} /><span className="num text-[12px] text-mute">{new Date(h.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div>
                  <div className="mt-1 text-[13px] text-mute">{people[h.user_id ?? ""]?.full_name ?? "—"}{people[h.user_id ?? ""] ? ` · ${t(("role_" + people[h.user_id ?? ""].role) as Key)}` : ""}</div>
                  {h.comment && <div className="mt-1 rounded-lg bg-cream px-2 py-1 text-[13px]">«{h.comment}»</div>}
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
