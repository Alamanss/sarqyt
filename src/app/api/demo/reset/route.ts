import { admin, almatyToday, caller, json } from "@/lib/server";

// Сброс демонстрации: возвращает отчёты текущего месяца к исходным статусам и убирает всё,
// что внесли сегодня при показе (записи, шаги истории, добавленные виды отходов).
// Доступно только демо-пользователям (@atu.demo). Исторические месяцы не трогает.
const START: Record<string, "draft" | "submitted" | "accepted"> = { iskander: "draft", canella: "submitted", "atu-inn": "accepted" };

export async function POST(req: Request) {
  const me = await caller(req);
  if (!me) return json({ error: "unauthorized" }, 401);
  const db = admin();
  const { data: prof } = await db.from("profiles").select("email").eq("id", me.id).maybeSingle();
  if (!prof?.email?.endsWith("@atu.demo")) return json({ error: "forbidden" }, 403);

  const today = almatyToday();
  const month = today.slice(0, 7) + "-01";
  const dayStartUtc = new Date(`${today}T00:00:00+05:00`).toISOString();
  const [{ data: orgs }, { data: reports }] = await Promise.all([
    db.from("organizations").select("id, slug"),
    db.from("reports").select("*").eq("period_start", month),
  ]);
  const slugById = Object.fromEntries((orgs ?? []).map((o) => [o.id, o.slug as string]));
  let removed = 0;

  for (const r of reports ?? []) {
    const target = START[slugById[r.org_id]];
    // 1. открыть отчёт, чтобы снять блокировку записей
    await db.from("reports").update({ status: "draft" }).eq("id", r.id);
    // 2. убрать записи и шаги истории, появившиеся сегодня
    const del = await db.from("entries").delete({ count: "exact" }).eq("report_id", r.id).eq("entry_date", today);
    removed += del.count ?? 0;
    await db.from("status_history").delete().eq("report_id", r.id).gte("created_at", dayStartUtc);
    // 3. вернуть исходный статус; отчёт, созданный при показе у организации без него, удалить
    if (!target) { await db.from("reports").delete().eq("id", r.id); continue; }
    const { data: hist } = await db.from("status_history").select("*").eq("report_id", r.id).order("created_at");
    const sub = hist?.find((h) => h.to_status === "submitted"), acc = hist?.find((h) => h.to_status === "accepted");
    await db.from("reports").update({
      status: target,
      submitted_at: target === "draft" ? null : sub?.created_at ?? r.submitted_at,
      reviewer_id: target === "accepted" ? acc?.user_id ?? r.reviewer_id : null,
      decided_at: target === "accepted" ? acc?.created_at ?? r.decided_at : null,
    }).eq("id", r.id);
  }

  // 4. виды отходов, добавленные при показе и больше нигде не использованные
  const { data: extra } = await db.from("waste_types").select("id").is("category", null).gte("created_at", dayStartUtc);
  for (const t of extra ?? []) {
    const { count } = await db.from("entries").select("id", { count: "exact", head: true }).eq("waste_type_id", t.id);
    if (!count) await db.from("waste_types").delete().eq("id", t.id);
  }
  return json({ ok: true, removed });
}
