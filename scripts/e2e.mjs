// Сквозной сценарий из раздела 9 ТЗ на живой базе под демо-пользователями + управление администратора.
// Запуск: node --env-file=.env.local scripts/e2e.mjs   (в конце сам делает «Сбросить показ»)
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const base = "https://sarqyt-atu.vercel.app";
const pw = fs.readFileSync(new URL("./seed.mjs", import.meta.url), "utf8").match(/DEMO_PASSWORD = "([^"]+)"/)[1];
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const login = async (email, password = pw) => {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(email + ": " + error.message);
  return { c, token: data.session.access_token, id: data.user.id };
};
const api = (path, token, body = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
let fails = 0;
const ok = (n, name, pass, info = "") => { if (!pass) fails++; console.log(`${pass ? "PASS" : "FAIL"}  ${n}. ${name}${info ? "  — " + info : ""}`); };
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

const isk = await login("iskander@atu.demo"), rev = await login("reviewer@atu.demo"), adm = await login("admin@atu.demo");
await api("/api/demo/reset", isk.token); // чистый старт
const { data: org } = await svc.from("organizations").select("*").eq("slug", "iskander").single();

// 1–2. ответственный открывает форму и вносит взвешивания
const { data: rep, error: e1 } = await isk.c.rpc("get_or_create_report", { p_org: org.id, p_month: today.slice(0, 7) + "-01" });
ok(1, "Ответственный открывает отчёт месяца", !e1 && rep.status === "draft", e1?.message ?? rep.status);
const { data: types } = await isk.c.from("waste_types").select("*").eq("org_id", org.id).eq("active", true);
const pick = (name) => types.find((t) => t.name_ru === name);
const { count: before } = await isk.c.from("entries").select("id", { count: "exact", head: true }).eq("report_id", rep.id);
const { error: e2 } = await isk.c.from("entries").insert([
  { report_id: rep.id, org_id: org.id, entry_date: today, waste_type_id: pick("Очистки овощей").id, quantity: 4.2 },
  { report_id: rep.id, org_id: org.id, entry_date: today, waste_type_id: pick("Картонная тара").id, quantity: 1.6 },
]);
const { data: mine } = await isk.c.from("entries").select("*").eq("report_id", rep.id).eq("entry_date", today);
ok(2, "Две записи списком; способ и ответственный подставлены", !e2 && mine.length === 2 && mine.every((x) => x.disposal_id && x.responsible_id === isk.id), e2?.message ?? "");
const { error: eNeg } = await isk.c.from("entries").insert({ report_id: rep.id, org_id: org.id, entry_date: today, waste_type_id: pick("Картонная тара").id, quantity: -1 });
const { error: eFut } = await isk.c.from("entries").insert({ report_id: rep.id, org_id: org.id, entry_date: "2026-11-25", waste_type_id: pick("Картонная тара").id, quantity: 1 });
ok("2a", "Сервер отклоняет отрицательный вес и дату в будущем", !!eNeg && !!eFut);

// 3. новый вид отхода
const { data: nt, error: e3 } = await isk.c.from("waste_types").insert({ org_id: org.id, name_ru: "Проверочный вид (e2e)", name_kk: "Проверочный вид (e2e)", unit: "kg", default_disposal_id: pick("Картонная тара").default_disposal_id, co2_factor: 0.70021 }).select().single();
const { error: e3b } = await isk.c.from("entries").insert({ report_id: rep.id, org_id: org.id, entry_date: today, waste_type_id: nt?.id, quantity: 0.7 });
ok(3, "Новый вид отхода добавлен и использован", !e3 && !e3b, e3?.message ?? e3b?.message ?? "");

// 4. отправка
const { data: s4, error: e4 } = await isk.c.rpc("submit_report", { p_report: rep.id });
ok(4, "Отчёт отправлен — статус «отправлено»", !e4 && s4.status === "submitted", e4?.message ?? "");
const { error: eLock } = await isk.c.from("entries").insert({ report_id: rep.id, org_id: org.id, entry_date: today, waste_type_id: pick("Картонная тара").id, quantity: 1 });
ok("4a", "После отправки записи менять нельзя", !!eLock && /REPORT_LOCKED/.test(eLock.message), eLock?.message ?? "вставка прошла!");

// 5. проверяющий возвращает с комментарием
const { data: s5 } = await rev.c.rpc("start_review", { p_report: rep.id });
const { error: eNoC } = await rev.c.rpc("decide_report", { p_report: rep.id, p_accept: false, p_comment: "  " });
const { data: s5b, error: e5 } = await rev.c.rpc("decide_report", { p_report: rep.id, p_accept: false, p_comment: "Уточните вес картона за 12 ноября" });
ok(5, "Проверяющий: «на проверке» → возврат; без комментария возврат запрещён", s5?.status === "in_review" && !!eNoC && /COMMENT_REQUIRED/.test(eNoC.message) && !e5 && s5b.status === "returned", e5?.message ?? "");
const { data: h5 } = await isk.c.from("status_history").select("*").eq("report_id", rep.id).eq("to_status", "returned");
const { data: r5 } = await isk.c.from("reports").select("status").eq("id", rep.id).single();
ok("5a", "Ответственный видит «возвращено» и комментарий", r5.status === "returned" && h5?.[0]?.comment?.includes("картона"));

// 6. исправление, повторная отправка, принятие
const card = mine.find((x) => x.waste_type_id === pick("Картонная тара").id);
const { error: e6 } = await isk.c.from("entries").update({ quantity: 1.8 }).eq("id", card.id);
const { error: e6b } = await isk.c.rpc("submit_report", { p_report: rep.id });
const { data: s6, error: e6c } = await rev.c.rpc("decide_report", { p_report: rep.id, p_accept: true });
const { data: hist } = await rev.c.from("status_history").select("to_status").eq("report_id", rep.id).order("created_at");
ok(6, "Исправлено, отправлено повторно, принято; в истории все шаги", !e6 && !e6b && !e6c && s6.status === "accepted" && hist.map((h) => h.to_status).join(">").endsWith("submitted>in_review>returned>submitted>accepted"), (e6 ?? e6b ?? e6c)?.message ?? hist.map((h) => h.to_status).join(" > "));
const { error: eAcc } = await isk.c.from("entries").update({ quantity: 9 }).eq("id", card.id).select();
const { data: after } = await svc.from("entries").select("quantity").eq("id", card.id).single();
ok("6a", "Принятый отчёт заблокирован от редактирования", Number(after.quantity) === 1.8, eAcc?.message ?? "");

// 7. реестр: записи принятого отчёта видны проверяющему, фильтры работают
const { data: acc } = await rev.c.from("reports").select("id").eq("status", "accepted");
const ids = acc.map((r) => r.id);
const { data: reg } = await rev.c.from("entries").select("id, quantity, waste_type_id, org_id").in("report_id", ids).eq("entry_date", today).eq("org_id", org.id);
const { data: regF } = await rev.c.from("entries").select("id").in("report_id", ids).eq("entry_date", today).eq("org_id", org.id).eq("waste_type_id", pick("Очистки овощей").id);
ok(7, "Данные в реестре; фильтр по организации, дате и виду", reg.length === 3 && regF.length === 1, `в реестре за сегодня: ${reg.length}, по фильтру вида: ${regF.length}`);

// 8–9. аналитика и свод строятся из тех же записей реестра
const sum = reg.reduce((a, e) => a + Number(e.quantity), 0);
ok(8, "Итог дня в реестре совпадает с введённым (4,2 + 1,8 + 0,7)", Math.abs(sum - 6.7) < 0.001, String(sum));
const { count: q3 } = await rev.c.from("entries").select("id", { count: "exact", head: true }).in("report_id", ids).gte("entry_date", "2026-07-01").lte("entry_date", "2026-09-30");
const { data: q3orgs } = await rev.c.from("reports").select("org_id").eq("status", "accepted").gte("period_start", "2026-07-01").lte("period_start", "2026-09-01");
ok(9, "Данные для квартального свода: все 5 организаций за 3 квартал", q3 > 500 && new Set(q3orgs.map((r) => r.org_id)).size === 5, `записей: ${q3}, организаций: ${new Set(q3orgs.map((r) => r.org_id)).size}`);

// 10. несдавшие за текущий месяц
const { data: orgs } = await rev.c.from("organizations").select("id, name_ru").eq("active", true);
const { data: nov } = await rev.c.from("reports").select("org_id, status").eq("period_start", today.slice(0, 7) + "-01");
const missing = orgs.filter((o) => nov.find((r) => r.org_id === o.id)?.status !== "accepted").map((o) => o.name_ru);
ok(10, "Видно, кто не сдал отчёт за текущий месяц", missing.length >= 2, missing.join("; "));

// управление: новая организация и пользователь без изменения кода (ФТ-4.2, 4.3)
const slug = "e2e-" + Date.now();
const { data: no, error: eo } = await adm.c.from("organizations").insert({ slug, name_ru: "Буфет корпуса 3 (e2e)", name_kk: "Буфет корпуса 3 (e2e)", type: "canteen" }).select().single();
const email = `e2e-${Date.now()}@atu.demo`;
const cu = await api("/api/admin/users", adm.token, { email, password: "E2e-" + Date.now(), full_name: "Проверочный Пользователь", role: "responsible", org_id: no?.id });
const { data: np } = await svc.from("profiles").select("*").eq("email", email).maybeSingle();
ok(11, "Администратор подключает организацию и пользователя через систему", !eo && cu.status === 200 && np?.role === "responsible" && np?.org_id === no.id, eo?.message ?? JSON.stringify(cu.j));
const cuNo = await api("/api/admin/users", isk.token, { email: "x" + email, password: "12345678", full_name: "x", role: "admin", org_id: null });
ok("11a", "Не администратор создать пользователя не может", cuNo.status === 403);
if (np) await svc.auth.admin.deleteUser(np.id);
if (no) await svc.from("organizations").delete().eq("id", no.id);

// сброс показа возвращает исходное состояние
const rs = await api("/api/demo/reset", isk.token);
const { data: back } = await svc.from("reports").select("status").eq("id", rep.id).single();
const { count: left } = await svc.from("entries").select("id", { count: "exact", head: true }).eq("report_id", rep.id);
const { data: junk } = await svc.from("waste_types").select("id").eq("name_ru", "Проверочный вид (e2e)");
ok(12, "«Сбросить показ» возвращает черновик и убирает внесённое", rs.status === 200 && back.status === "draft" && left === before && junk.length === 0, `удалено ${rs.j?.removed}, записей в отчёте ${left} (было ${before})`);
console.log(fails ? `ИТОГО: провалено ${fails}` : "ИТОГО: все шаги пройдены");
