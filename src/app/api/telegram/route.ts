import { admin, almatyToday, ensureReport, json, parsePhrase, tg, tgSecret, tgSign } from "@/lib/server";

type Msg = { chat: { id: number }; text?: string; from?: { first_name?: string } };
const f1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("ru-RU");

// Вебхук Telegram-бота: быстрый ввод взвешиваний текстом
export async function POST(req: Request) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== tgSecret()) return json({ error: "forbidden" }, 403);
  const upd = (await req.json().catch(() => ({}))) as { message?: Msg };
  const m = upd.message;
  if (!m?.chat?.id) return json({ ok: true });
  const chat = m.chat.id;
  const say = (text: string) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML" });
  const text = (m.text || "").trim();
  const db = admin();

  try {
    // привязка аккаунта: /start <uid><подпись>
    if (text.startsWith("/start")) {
      const p = text.split(/\s+/)[1] || "";
      if (p.length === 48) {
        const hex = p.slice(0, 32), sig = p.slice(32);
        const uid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        if (tgSign(uid) === sig) {
          await db.from("profiles").update({ telegram_chat_id: null }).eq("telegram_chat_id", chat);
          const { data: prof } = await db.from("profiles").update({ telegram_chat_id: chat }).eq("id", uid).select("*, organizations(name_ru)").maybeSingle();
          if (prof) {
            await say(`✅ Аккаунт привязан: <b>${prof.full_name}</b>\n${prof.organizations?.name_ru ?? ""}\n\nПишите взвешивания обычным текстом, например:\n<code>очистки овощей 4,5</code>\n<code>масло 2 литра</code>\n\n/status — итоги за месяц\n/types — виды отходов`);
            return json({ ok: true });
          }
        }
      }
      await say("Здравствуйте! Это бот системы <b>Sarqyt</b>.\nЧтобы привязать аккаунт, откройте в системе раздел «Ввод» и нажмите «Telegram-бот».");
      return json({ ok: true });
    }

    const { data: prof } = await db.from("profiles").select("*").eq("telegram_chat_id", chat).maybeSingle();
    if (!prof) { await say("Аккаунт не привязан. Откройте в системе раздел «Ввод» → «Telegram-бот»."); return json({ ok: true }); }
    if (prof.role !== "responsible" || !prof.org_id) { await say("Ввод через бота доступен ответственным лицам организаций. Напоминания о сроках будут приходить сюда."); return json({ ok: true }); }

    const { data: types } = await db.from("waste_types").select("*").eq("org_id", prof.org_id).eq("active", true).order("created_at");
    const list = (types ?? []).map((t) => ({ id: t.id as string, name: t.name_ru as string, unit: t.unit as string, disposal: t.default_disposal_id as string | null }));
    const date = almatyToday();
    const report = await ensureReport(db, prof.org_id, date);
    const totals = async () => {
      const { data } = await db.from("entries").select("quantity, entry_date").eq("report_id", report.id).limit(5000);
      const all = data ?? [];
      return { month: all.reduce((a, e) => a + Number(e.quantity), 0), day: all.filter((e) => e.entry_date === date).reduce((a, e) => a + Number(e.quantity), 0), n: all.length };
    };
    const ST: Record<string, string> = { draft: "черновик", submitted: "отправлено", in_review: "на проверке", accepted: "принято", returned: "возвращено на доработку" };

    if (text === "/types") { await say("Виды отходов вашей организации:\n" + list.map((t) => `• ${t.name} (${t.unit === "l" ? "л" : "кг"})`).join("\n")); return json({ ok: true }); }
    if (text === "/status") {
      const s = await totals();
      await say(`📊 Отчёт за ${date.slice(5, 7)}.${date.slice(0, 4)}: <b>${ST[report.status]}</b>\nЗаписей: ${s.n}\nЗа сегодня: ${f1(s.day)}\nЗа месяц: <b>${f1(s.month)}</b>`);
      return json({ ok: true });
    }
    if (!text) { await say("Напишите взвешивание текстом, например: <code>очистки овощей 4,5</code>"); return json({ ok: true }); }
    if (!["draft", "returned"].includes(report.status)) { await say(`Отчёт за этот месяц уже ${ST[report.status]} — новые записи не принимаются.`); return json({ ok: true }); }

    const r = await parsePhrase(text, list);
    const type = list.find((t) => t.id === r.typeId);
    if (!type || !(r.quantity > 0) || r.quantity > 500) {
      await say("Не понял запись 🤔 Напишите вид отхода и количество, например:\n<code>очистки овощей 4,5</code>\n\n/types — список видов");
      return json({ ok: true });
    }
    const { error } = await db.from("entries").insert({
      report_id: report.id, org_id: prof.org_id, entry_date: date, waste_type_id: type.id, quantity: r.quantity,
      disposal_id: type.disposal, responsible_id: prof.id, source: "telegram",
    });
    if (error) { await say("Не удалось сохранить: " + error.message); return json({ ok: true }); }
    const s = await totals();
    await say(`✅ <b>${type.name}</b> — ${f1(r.quantity)} ${type.unit === "l" ? "л" : "кг"}\nЗа сегодня: ${f1(s.day)} · за месяц: ${f1(s.month)}`);
  } catch (e) {
    console.error("telegram:", (e as Error).message);
  }
  return json({ ok: true });
}
