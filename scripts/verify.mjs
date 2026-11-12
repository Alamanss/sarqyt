// Проверка серверных функций на живом сайте под демо-пользователями.
// Запуск: node --env-file=.env.local scripts/verify.mjs [путь к картинке таблицы для OCR]
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import fs from "node:fs";

const base = "https://sarqyt-atu.vercel.app";
const pw = fs.readFileSync(new URL("./seed.mjs", import.meta.url), "utf8").match(/DEMO_PASSWORD = "([^"]+)"/)[1];
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const login = async (email) => {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) throw error;
  return { token: data.session.access_token, id: data.user.id, c };
};
const post = async (path, body, headers = {}) => {
  const t0 = Date.now();
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  let j; try { j = await r.json(); } catch { j = null; }
  return { status: r.status, j, ms: Date.now() - t0 };
};
const ok = (name, pass, info = "") => console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? "  — " + info : ""}`);

// ---------- 1. OCR бланка ----------
const isk = await login("iskander@atu.demo");
const { data: orgs } = await svc.from("organizations").select("*");
const org = (slug) => orgs.find((o) => o.slug === slug);
const { data: allTypes } = await svc.from("waste_types").select("*").eq("active", true);
const typesOf = (slug) => allTypes.filter((t) => t.org_id === org(slug).id).map((t) => ({ id: t.id, name: t.name_ru }));
if (process.argv[2]) {
  const img = "data:image/jpeg;base64," + fs.readFileSync(process.argv[2]).toString("base64");
  const can = await login("canella@atu.demo");
  const r = await post("/api/ai/ocr", { image: img, types: typesOf("canella"), month: "2026-11" }, { authorization: "Bearer " + can.token });
  const rows = r.j?.rows ?? [];
  ok("OCR таблицы по фото", r.status === 200 && rows.length >= 3, `${rows.length} строк за ${r.ms} мс; первая: ${JSON.stringify(rows[0] ?? null)}; сопоставлено с видами: ${rows.filter((x) => x.typeId).length}`);
}

// ---------- 2. Сводка от ИИ ----------
{
  const r = await post("/api/ai/summary", { lang: "ru", scope: "проверка", months: [{ month: "2026-09", kg: 560 }, { month: "2026-10", kg: 725 }], totalKg: 1285, co2Kg: 900, co2SavedKg: 10, co2PotentialKg: 880, recycledPercent: 1, changeVsPrevMonthPercent: 29, topWaste: [{ name: "Пищевые отходы из зала", kg: 540 }], anomalies: [], potential: [{ waste: "Пищевые отходы из зала", kg: 540, method: "Компостирование", co2SavingKg: 373 }] }, { authorization: "Bearer " + isk.token });
  ok("Сводка от ИИ", r.status === 200 && typeof r.j?.text === "string", `${r.ms} мс; ${String(r.j?.text).slice(0, 90)}…`);
}

// ---------- 3. Telegram-бот (имитация сообщений Telegram) ----------
{
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = createHmac("sha256", token).update("webhook").digest("hex").slice(0, 32);
  const sign = (uid) => createHmac("sha256", token).update(uid).digest("hex").slice(0, 16);
  const tpp = await login("tpp@atu.demo");
  const { data: before } = await svc.from("profiles").select("telegram_chat_id").eq("id", tpp.id).single();
  const CHAT = 990000000 + Math.floor(Math.random() * 1000);
  const tgPost = (text) => post("/api/telegram", { message: { chat: { id: CHAT }, text } }, { "x-telegram-bot-api-secret-token": secret });

  const noSecret = await post("/api/telegram", { message: { chat: { id: CHAT }, text: "/start" } });
  ok("Бот: чужой запрос без секрета отклонён", noSecret.status === 403);
  await tgPost(`/start ${tpp.id.replace(/-/g, "")}${sign(tpp.id)}`);
  const { data: linked } = await svc.from("profiles").select("telegram_chat_id").eq("id", tpp.id).single();
  ok("Бот: привязка аккаунта по подписанной ссылке", Number(linked.telegram_chat_id) === CHAT);
  const fake = await tgPost(`/start ${tpp.id.replace(/-/g, "")}0000000000000000`);
  void fake;
  await tgPost("мясные кости 2,5");
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const { data: ent } = await svc.from("entries").select("*, waste_types(name_ru)").eq("org_id", org("tpp").id).eq("entry_date", today).eq("source", "telegram");
  ok("Бот: запись из сообщения «мясные кости 2,5»", ent?.length === 1 && Number(ent[0].quantity) === 2.5, ent?.[0] ? `${ent[0].waste_types.name_ru}, ${ent[0].quantity}` : "записи нет");
  await tgPost("привет как дела");
  const { count } = await svc.from("entries").select("id", { count: "exact", head: true }).eq("org_id", org("tpp").id).eq("entry_date", today).eq("source", "telegram");
  ok("Бот: непонятный текст не создаёт запись", count === 1);

  // ---------- 4. Напоминания ----------
  const adm = await login("admin@atu.demo");
  const rem = await post("/api/remind", {}, { authorization: "Bearer " + adm.token });
  ok("Напоминания о сроках", rem.status === 200 && Array.isArray(rem.j?.missing), `отправлено ${rem.j?.sent}, без Telegram ${rem.j?.noTelegram}, должники: ${(rem.j?.missing ?? []).join("; ")}`);
  const remNo = await post("/api/remind", {}, { authorization: "Bearer " + isk.token });
  ok("Напоминания: ответственному запрещено", remNo.status === 403);

  // уборка: убрать тестовую запись и отчёт, вернуть привязку Telegram как была
  if (ent?.length) { await svc.from("reports").delete().eq("id", ent[0].report_id); }
  await svc.from("profiles").update({ telegram_chat_id: before.telegram_chat_id }).eq("id", tpp.id);
}

// ---------- 5. Права доступа на сервере ----------
{
  const { data: foreign } = await isk.c.from("entries").select("id").eq("org_id", org("canella").id).limit(1);
  ok("Права: столовая не видит записи кофейни", (foreign ?? []).length === 0);
  const { data: rep } = await svc.from("reports").select("id").eq("org_id", org("canella").id).eq("period_start", "2026-11-01").single();
  const { error } = await isk.c.rpc("decide_report", { p_report: rep.id, p_accept: true });
  ok("Права: ответственный не может принять отчёт", !!error && /FORBIDDEN/.test(error.message));
  const { error: e2 } = await isk.c.from("profiles").update({ role: "admin" }).eq("id", isk.id).select();
  const { data: me } = await svc.from("profiles").select("role").eq("id", isk.id).single();
  ok("Права: нельзя выдать себе роль администратора", me.role === "responsible", e2?.message ?? "");
  const scale = await post("/api/scale", { org: "iskander", waste: "Очистки овощей", weight: 1 }, { "x-api-key": "wrong" });
  ok("Весы: неверный ключ отклонён", scale.status === 401);
}
console.log("готово");
