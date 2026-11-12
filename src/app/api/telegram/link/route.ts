import { caller, json, tg, tgSign } from "@/lib/server";

// Ссылка для привязки Telegram к аккаунту (подписанная, чтобы нельзя было привязать чужой)
export async function POST(req: Request) {
  const me = await caller(req);
  if (!me) return json({ error: "unauthorized" }, 401);
  if (!process.env.TELEGRAM_BOT_TOKEN) return json({ error: "Бот не настроен" }, 503);
  const bot = (await tg("getMe", {})) as { result?: { username?: string } };
  if (!bot.result?.username) return json({ error: "Бот недоступен" }, 503);
  return json({ url: `https://t.me/${bot.result.username}?start=${me.id.replace(/-/g, "")}${tgSign(me.id)}` });
}
