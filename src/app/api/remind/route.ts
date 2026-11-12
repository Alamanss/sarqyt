import { admin, almatyToday, caller, json, tg } from "@/lib/server";

const MON = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

// Напоминания о сроках: организациям без принятого/отправленного отчёта за прошлый месяц
// и без записей в текущем. Запускается кнопкой администратора или по расписанию (Vercel Cron).
async function run() {
  const db = admin();
  const today = almatyToday();
  const cur = today.slice(0, 7) + "-01";
  const d = new Date(today); d.setUTCMonth(d.getUTCMonth() - 1);
  const prev = d.toISOString().slice(0, 7) + "-01";
  const [{ data: orgs }, { data: reports }, { data: users }] = await Promise.all([
    db.from("organizations").select("*").eq("active", true),
    db.from("reports").select("*").in("period_start", [prev, cur]),
    db.from("profiles").select("*").eq("role", "responsible"),
  ]);
  let sent = 0, noTelegram = 0; const missing: string[] = [];
  for (const o of orgs ?? []) {
    const rp = (reports ?? []).find((r) => r.org_id === o.id && r.period_start === prev);
    const rc = (reports ?? []).find((r) => r.org_id === o.id && r.period_start === cur);
    const lines: string[] = [];
    if (!rp || ["draft", "returned"].includes(rp.status)) lines.push(`• отчёт за ${MON[Number(prev.slice(5, 7)) - 1]} не сдан${rp?.status === "returned" ? " (возвращён на доработку)" : ""}`);
    if (!rc) lines.push(`• за ${MON[Number(cur.slice(5, 7)) - 1]} ещё нет ни одной записи`);
    else if (rc.status === "returned") lines.push(`• отчёт за ${MON[Number(cur.slice(5, 7)) - 1]} возвращён на доработку`);
    if (!lines.length) continue;
    missing.push(o.name_ru);
    for (const u of (users ?? []).filter((x) => x.org_id === o.id)) {
      if (!u.telegram_chat_id) { noTelegram++; continue; }
      await tg("sendMessage", { chat_id: u.telegram_chat_id, parse_mode: "HTML", text: `⏰ <b>Напоминание ZeroWaste ATU</b>\n${o.name_ru}\n${lines.join("\n")}\n\nСрок сдачи — до 5-го числа следующего месяца.` });
      sent++;
    }
  }
  return { sent, noTelegram, missing };
}

export async function POST(req: Request) {
  const me = await caller(req);
  if (!me || !["admin", "reviewer"].includes(me.role)) return json({ error: "forbidden" }, 403);
  return json(await run());
}

// Vercel Cron (заголовок authorization: Bearer <CRON_SECRET>)
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return json({ error: "forbidden" }, 403);
  return json(await run());
}
