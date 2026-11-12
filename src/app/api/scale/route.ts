import { admin, almatyToday, ensureReport, fuzzy, json } from "@/lib/server";

/**
 * API для электронных весов (стык с Треком 2).
 * POST /api/scale   заголовок x-api-key: <SCALE_API_KEY>
 * { "org": "iskander", "waste": "Очистки овощей", "weight": 4.2, "device": "scale-01" }
 */
export async function POST(req: Request) {
  if (!process.env.SCALE_API_KEY || req.headers.get("x-api-key") !== process.env.SCALE_API_KEY) return json({ error: "invalid api key" }, 401);
  const b = (await req.json().catch(() => null)) as { org?: string; waste?: string; weight?: number; device?: string } | null;
  const weight = Number(b?.weight);
  if (!b?.org || !b.waste || !(weight > 0) || weight > 500) return json({ error: "org, waste, weight (0..500) are required" }, 400);
  const db = admin();
  const { data: org } = await db.from("organizations").select("*").eq("slug", b.org).maybeSingle();
  if (!org) return json({ error: "unknown org" }, 404);
  const { data: types } = await db.from("waste_types").select("*").eq("org_id", org.id).eq("active", true);
  const list = (types ?? []).map((t) => ({ ...t, name: t.name_ru as string }));
  const type = list.find((t) => t.name.toLowerCase() === b.waste!.toLowerCase()) ?? fuzzy(b.waste, list);
  if (!type) return json({ error: "unknown waste type", known: list.map((t) => t.name) }, 422);
  const date = almatyToday();
  const report = await ensureReport(db, org.id, date);
  if (!["draft", "returned"].includes(report.status)) return json({ error: "report for this month is locked", status: report.status }, 409);
  const { data, error } = await db.from("entries").insert({
    report_id: report.id, org_id: org.id, entry_date: date, waste_type_id: type.id, quantity: Math.round(weight * 100) / 100,
    disposal_id: type.default_disposal_id, source: "scale", note: b.device ?? null,
  }).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, entry_id: data.id, org: org.name_ru, waste: type.name, weight: data.quantity, unit: type.unit, date });
}

export async function GET() {
  return json({
    name: "ZeroWaste ATU scale API",
    usage: "POST /api/scale with header x-api-key and JSON body {org, waste, weight, device?}",
    orgs: ["tpp", "thipp", "atu-inn", "canella", "iskander"],
  });
}
