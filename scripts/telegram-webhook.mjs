// Регистрирует вебхук Telegram-бота. Запуск: node --env-file=.env.local scripts/telegram-webhook.mjs https://<домен>
import { createHmac } from "node:crypto";
const token = process.env.TELEGRAM_BOT_TOKEN, base = process.argv[2];
if (!token || !base) { console.error("нужен TELEGRAM_BOT_TOKEN и адрес сайта"); process.exit(1); }
const secret = createHmac("sha256", token).update("webhook").digest("hex").slice(0, 32);
const call = (m, b) => fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const r = await call("setWebhook", { url: base + "/api/telegram", secret_token: secret, allowed_updates: ["message"] });
console.log("webhook:", r.ok, r.description);
await call("setMyCommands", { commands: [{ command: "status", description: "Итоги за месяц" }, { command: "types", description: "Виды отходов" }] });
const me = await call("getMe", {}); console.log("bot: @" + me.result?.username);
