// Демо-данные: пользователи по ролям и записи за июль–ноябрь 2026 по пяти организациям.
// Запуск: node --env-file=.env.local scripts/seed.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Нет NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

export const DEMO_PASSWORD = "Atu2026demo";
const USERS = [
  { email: "iskander@atu.demo", name: "Айгерим Сатпаева", role: "responsible", org: "iskander" },
  { email: "canella@atu.demo", name: "Данияр Ахметов", role: "responsible", org: "canella" },
  { email: "inn@atu.demo", name: "Мадина Оспанова", role: "responsible", org: "atu-inn" },
  { email: "tpp@atu.demo", name: "Ерлан Жумабаев", role: "responsible", org: "tpp" },
  { email: "thipp@atu.demo", name: "Асель Нурланова", role: "responsible", org: "thipp" },
  { email: "reviewer@atu.demo", name: "Гульнара Касымова", role: "reviewer", org: null },
  { email: "admin@atu.demo", name: "Администратор системы", role: "admin", org: null },
  { email: "boss@atu.demo", name: "Руководство АТУ", role: "management", org: null },
];

let s = 20261112;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (a, b) => Math.round((a + rnd() * (b - a)) * 10) / 10;

// [мин, макс] за одну запись, вероятность записи в рабочий день
const PROFILE = {
  iskander: { days: [1, 2, 3, 4, 5, 6], k: 1, types: {
    "Очистки овощей": [4, 9, 1], "Обрезки мясопродуктов": [1, 3, 0.9], "Пищевые отходы из зала": [5, 12, 1],
    "Остатки нереализованной продукции": [2, 6, 0.8], "Отработанное масло": [2, 5, 0.2], "Картонная тара": [1, 4, 0.5] } },
  "atu-inn": { days: [1, 2, 3, 4, 5, 6, 0], k: 0.6, types: {
    "Очистки овощей": [4, 9, 1], "Обрезки мясопродуктов": [1, 3, 0.8], "Пищевые отходы из зала": [5, 12, 0.9],
    "Остатки нереализованной продукции": [2, 6, 0.6], "Отработанное масло": [2, 5, 0.15], "Картонная тара": [1, 4, 0.4] } },
  canella: { days: [1, 2, 3, 4, 5, 6], k: 1, types: {
    "Кофейный жмых": [2, 5, 1], "Картонная тара": [0.5, 2, 0.5], "Остатки еды": [1, 3, 0.8] } },
  tpp: { days: [2, 4], k: 1, types: {
    "Упаковочные отходы": [0.3, 1.5, 0.9], "Мясные кости": [0.5, 2.5, 0.8], "Рыбные кости": [0.3, 1.5, 0.5] } },
  thipp: { days: [1, 3, 5], k: 1, types: {
    "Яичная скорлупа": [0.1, 0.6, 0.7], "Сахароза": [0.1, 0.5, 0.3], "ПЭТ-бутылка 1,0 л (растительное масло)": [0.05, 0.3, 0.4],
    "Стеклобутылка": [0.3, 1.2, 0.3], "Отходы образцов хлебобулочных изделий": [0.5, 2.5, 0.8],
    "Отходы образцов кондитерских изделий": [0.3, 1.5, 0.6], "Отходы фруктов и овощей": [0.5, 3, 0.7], "Алюминиевые банки": [0.1, 0.5, 0.3] } },
};

// месяц (0-11), статус отчёта по организациям
const MONTHS = [
  { m: 6, status: () => "accepted" },
  { m: 7, status: () => "accepted" },
  { m: 8, status: () => "accepted" },
  { m: 9, status: () => "accepted" },
  { m: 10, status: (slug) => ({ iskander: "draft", canella: "submitted", "atu-inn": "accepted" }[slug] ?? null) },
];
const TODAY = new Date(Date.UTC(2026, 10, 12));
const iso = (d) => d.toISOString().slice(0, 10);

async function main() {
  const { data: orgs, error: e0 } = await db.from("organizations").select("*");
  if (e0) throw e0;
  if (!orgs?.length) throw new Error("Таблица organizations пуста — сначала запустите supabase/schema.sql");
  const orgBySlug = Object.fromEntries(orgs.map((o) => [o.slug, o]));
  console.log("организаций:", orgs.length);

  // пользователи
  const { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
  const ids = {};
  for (const u of USERS) {
    let id = list.users.find((x) => x.email === u.email)?.id;
    if (!id) {
      const { data, error } = await db.auth.admin.createUser({ email: u.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: u.name } });
      if (error) throw error;
      id = data.user.id;
    }
    ids[u.email] = id;
    const { error } = await db.from("profiles").upsert({ id, full_name: u.name, email: u.email, role: u.role, org_id: u.org ? orgBySlug[u.org].id : null });
    if (error) throw error;
  }
  console.log("пользователей:", USERS.length);
  const reviewer = ids["reviewer@atu.demo"];

  // чистим прежние демо-записи
  await db.from("reports").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const { data: types } = await db.from("waste_types").select("*");
  let total = 0;
  for (const [slug, prof] of Object.entries(PROFILE)) {
    const org = orgBySlug[slug];
    const resp = ids[USERS.find((u) => u.org === slug).email];
    const tmap = Object.fromEntries(types.filter((t) => t.org_id === org.id).map((t) => [t.name_ru, t]));
    for (const { m, status } of MONTHS) {
      const st = status(slug);
      if (!st) continue;
      const start = new Date(Date.UTC(2026, m, 1));
      const end = new Date(Date.UTC(2026, m + 1, 0));
      const { data: rep, error } = await db.from("reports").insert({ org_id: org.id, period_start: iso(start), period_end: iso(end), status: "draft" }).select().single();
      if (error) throw error;
      const rows = [];
      // сентябрь — начало семестра, рост; октябрь у столовой — заметный всплеск «отходов из зала»
      const season = m === 6 ? 0.55 : m === 7 ? 0.7 : 1;
      for (let d = new Date(start); d <= end && d < TODAY; d = new Date(d.getTime() + 86400000)) {
        if (!prof.days.includes(d.getUTCDay())) continue;
        for (const [name, [a, b, p]] of Object.entries(prof.types)) {
          if (rnd() > p) continue;
          let q = between(a, b) * prof.k * season;
          if (slug === "iskander" && m === 9 && name === "Пищевые отходы из зала") q *= 1.45;
          q = Math.max(0.1, Math.round(q * 10) / 10);
          const t = tmap[name];
          rows.push({ report_id: rep.id, org_id: org.id, entry_date: iso(d), waste_type_id: t.id, quantity: q, disposal_id: t.default_disposal_id, responsible_id: resp, source: "web" });
        }
      }
      for (let i = 0; i < rows.length; i += 500) {
        const { error: e } = await db.from("entries").insert(rows.slice(i, i + 500));
        if (e) throw e;
      }
      total += rows.length;
      const sub = new Date(Date.UTC(2026, m + 1, 2, 9, 30));
      const dec = new Date(Date.UTC(2026, m + 1, 3, 11, 0));
      const hist = [{ report_id: rep.id, from_status: null, to_status: "draft", user_id: resp, created_at: start.toISOString() }];
      if (st !== "draft") {
        const subAt = m === 10 ? new Date(Date.UTC(2026, 10, 11, 12, 0)) : sub;
        hist.push({ report_id: rep.id, from_status: "draft", to_status: "submitted", user_id: resp, created_at: subAt.toISOString() });
        const upd = { status: st, submitted_at: subAt.toISOString() };
        if (st === "accepted") {
          const decAt = m === 10 ? new Date(Date.UTC(2026, 10, 11, 15, 0)) : dec;
          hist.push({ report_id: rep.id, from_status: "submitted", to_status: "in_review", user_id: reviewer, created_at: new Date(decAt.getTime() - 3600000).toISOString() });
          hist.push({ report_id: rep.id, from_status: "in_review", to_status: "accepted", user_id: reviewer, created_at: decAt.toISOString() });
          Object.assign(upd, { reviewer_id: reviewer, decided_at: decAt.toISOString() });
        }
        const { error: e } = await db.from("reports").update(upd).eq("id", rep.id);
        if (e) throw e;
      }
      const { error: e2 } = await db.from("status_history").insert(hist);
      if (e2) throw e2;
    }
  }
  console.log("записей:", total);
  console.log("готово");
}
main().catch((e) => { console.error("ОШИБКА:", e.message ?? e); process.exit(1); });
