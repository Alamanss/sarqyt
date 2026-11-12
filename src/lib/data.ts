"use client";
import { supabase, type Disposal, type Entry, type Org, type Report, type WasteType } from "./supabase";

export async function loadRefs() {
  const [o, w, d] = await Promise.all([
    supabase.from("organizations").select("*").order("name_ru"),
    supabase.from("waste_types").select("*").order("created_at"),
    supabase.from("disposal_methods").select("*").order("name_ru"),
  ]);
  return {
    orgs: (o.data ?? []) as Org[],
    types: (w.data ?? []) as WasteType[],
    disposals: (d.data ?? []) as Disposal[],
  };
}

/** Все записи (с пагинацией — у Supabase лимит 1000 строк на запрос) */
export async function loadEntries(opts: { from?: string; to?: string; orgId?: string; reportIds?: string[] } = {}) {
  const out: Entry[] = [];
  for (let page = 0; page < 20; page++) {
    let q = supabase.from("entries").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).range(page * 1000, page * 1000 + 999);
    if (opts.from) q = q.gte("entry_date", opts.from);
    if (opts.to) q = q.lte("entry_date", opts.to);
    if (opts.orgId) q = q.eq("org_id", opts.orgId);
    if (opts.reportIds) q = q.in("report_id", opts.reportIds);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as Entry[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadReports() {
  const { data } = await supabase.from("reports").select("*").order("period_start", { ascending: false });
  return (data ?? []) as Report[];
}

/** Единый реестр = записи отчётов со статусом «принято» */
export async function loadRegistry(from?: string, to?: string) {
  const reports = (await loadReports()).filter((r) => r.status === "accepted");
  const ids = new Set(reports.map((r) => r.id));
  const entries = (await loadEntries({ from, to })).filter((e) => ids.has(e.report_id));
  return { reports, entries };
}

export const ERR: Record<string, [string, string]> = {
  REPORT_LOCKED: ["Отчёт уже отправлен — записи нельзя менять", "Есеп жіберілген — жазбаларды өзгертуге болмайды"],
  DATE_OUT_OF_PERIOD: ["Дата вне периода отчёта", "Күн есеп кезеңінен тыс"],
  EMPTY_REPORT: ["В отчёте нет записей", "Есепте жазба жоқ"],
  COMMENT_REQUIRED: ["При возврате комментарий обязателен", "Қайтарған кезде пікір міндетті"],
  FORBIDDEN: ["Недостаточно прав", "Құқық жеткіліксіз"],
  BAD_STATUS: ["Отчёт в другом статусе — обновите страницу", "Есеп басқа мәртебеде — бетті жаңартыңыз"],
};
export function errText(e: unknown, lang: "ru" | "kk") {
  const msg = (e as { message?: string })?.message ?? String(e);
  for (const k of Object.keys(ERR)) if (msg.includes(k)) return ERR[k][lang === "kk" ? 1 : 0];
  return msg;
}

/** fetch к нашему API с токеном текущего пользователя */
export async function api(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + (data.session?.access_token ?? "") },
    body: JSON.stringify(body),
  });
  return res.json();
}
