import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** Проверяет токен вызывающего и возвращает его профиль (роль проверяется на сервере) */
export async function caller(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = admin();
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await db.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  return p as { id: string; role: string; org_id: string | null; full_name: string } | null;
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });

// Модель задаётся настройкой AI_MODEL; по умолчанию Claude Sonnet 5.5.
// effort: "low" — задачи короткие (классификация, разбор фразы), важна скорость ответа.
const MODEL = process.env.AI_MODEL || "claude-sonnet-5-5";

/** Запрос к Claude, ответ — JSON-объект (или null при любой ошибке, чтобы интерфейс не падал) */
export async function askJson(system: string, content: Anthropic.MessageParam["content"], maxTokens = 400): Promise<Record<string, unknown> | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL, max_tokens: Math.max(maxTokens, 1500), output_config: { effort: "low" }, system: system + "\nОтвечай ТОЛЬКО одним JSON-объектом, без пояснений и без markdown.",
      messages: [{ role: "user", content }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (e) {
    console.error("AI error:", (e as Error).message);
    return null;
  }
}

export function imagePart(dataUrl: string): Anthropic.ImageBlockParam | null {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!m) return null;
  return { type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg", data: m[2] } };
}

/** Найти или создать отчёт организации за месяц даты (серверная версия, без проверки ролей) */
export async function ensureReport(db: SupabaseClient, orgId: string, date: string) {
  const start = date.slice(0, 7) + "-01";
  const { data: found } = await db.from("reports").select("*").eq("org_id", orgId).eq("period_start", start).maybeSingle();
  if (found) return found as { id: string; status: string };
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const end = `${date.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const { data, error } = await db.from("reports").insert({ org_id: orgId, period_start: start, period_end: end }).select().single();
  if (error) throw error;
  await db.from("status_history").insert({ report_id: data.id, from_status: null, to_status: "draft" });
  return data as { id: string; status: string };
}

export const almatyToday = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);

/** Самое похожее название из списка (без ИИ) — запасной вариант */
export function fuzzy<T extends { name: string }>(text: string, list: T[]): T | null {
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-яәіңғүұқөһ0-9 ]/gi, " ");
  const words = norm(text).split(/\s+/).filter((w) => w.length > 2);
  let best: T | null = null, score = 0;
  for (const x of list) {
    const n = norm(x.name);
    const s = words.reduce((a, w) => a + (n.includes(w.slice(0, Math.max(4, w.length - 2))) ? 1 : 0), 0);
    if (s > score) { score = s; best = x; }
  }
  return best;
}

/** Фраза → вид отхода и количество (ИИ, с запасным разбором без ИИ) */
export async function parsePhrase(text: string, types: { id: string; name: string }[]) {
  const list = types.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
  const r = await askJson(
    "Ты разбираешь голосовую или текстовую запись о взвешивании пищевых отходов (русский или казахский язык).",
    `Справочник:\n${list}\n\nФраза: «${text}»\n\nВерни JSON: {"index": номер вида из справочника или 0, "quantity": число (кг или литры) или 0}`,
    200,
  );
  if (r) {
    const idx = Number(r.index) - 1;
    return { typeId: idx >= 0 && idx < types.length ? types[idx].id : null, quantity: Number(r.quantity) || 0 };
  }
  // запасной разбор без ИИ
  const num = text.replace(",", ".").match(/\d+(\.\d+)?/);
  return { typeId: fuzzy(text, types)?.id ?? null, quantity: num ? Number(num[0]) : 0 };
}

import { createHmac } from "node:crypto";
export const tgSecret = () => createHmac("sha256", process.env.TELEGRAM_BOT_TOKEN || "x").update("webhook").digest("hex").slice(0, 32);
export const tgSign = (uid: string) => createHmac("sha256", process.env.TELEGRAM_BOT_TOKEN || "x").update(uid).digest("hex").slice(0, 16);
export async function tg(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}
