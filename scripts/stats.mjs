// Показатели для презентации — те же формулы, что в аналитике (принятые отчёты)
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [{ data: orgs }, { data: types }, { data: disp }, { data: reps }] = await Promise.all([db.from("organizations").select("*"), db.from("waste_types").select("*"), db.from("disposal_methods").select("*"), db.from("reports").select("*").eq("status", "accepted")]);
let entries = [];
for (let p = 0; p < 10; p++) { const { data } = await db.from("entries").select("*").in("report_id", reps.map((r) => r.id)).range(p * 1000, p * 1000 + 999); entries.push(...data); if (data.length < 1000) break; }
const T = Object.fromEntries(types.map((t) => [t.id, t])), D = Object.fromEntries(disp.map((d) => [d.id, d])), O = Object.fromEntries(orgs.map((o) => [o.id, o]));
let kg = 0, co2 = 0, pot = 0, saved = 0, rec = 0; const byMonth = {}, byOrg = {}, byType = {}, potType = {};
for (const e of entries) {
  const t = T[e.waste_type_id], d = D[e.disposal_id]; const q = Number(e.quantity); const tons = q * (t.unit === "l" ? 0.92 : 1) / 1000;
  const land = Number(t.co2_landfill), r = Number(t.co2_recommended); const isL = !d || !d.code || d.code === "TBO"; const f = isL ? land : Number(d.co2_factor ?? r);
  kg += q; co2 += tons * f; saved += tons * (land - f); if (isL) { pot += tons * (land - r); potType[t.name_ru] = (potType[t.name_ru] || 0) + tons * (land - r); } if (d?.is_recycling) rec += q;
  const m = e.entry_date.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + q; byOrg[O[e.org_id].name_ru] = (byOrg[O[e.org_id].name_ru] || 0) + q; byType[t.name_ru] = (byType[t.name_ru] || 0) + q;
}
const r0 = (x) => Math.round(x); const sort = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r0(v)]);
console.log(JSON.stringify({ entries: entries.length, kg: r0(kg), co2: r0(co2), saved: r0(saved), potential: r0(pot), recycledPct: Math.round(rec / kg * 1000) / 10, byMonth: sort(byMonth).sort(), byOrg: sort(byOrg), byType: sort(byType).slice(0, 6), potType: sort(potType).slice(0, 4) }, null, 1));
