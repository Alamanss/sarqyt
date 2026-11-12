import { caller, json, parsePhrase } from "@/lib/server";

// Голосовая запись → текст (Groq Whisper) → вид отхода и вес (Claude).
// Без ключа GROQ_API_KEY отвечает 503, и интерфейс переходит на распознавание браузером.
export async function POST(req: Request) {
  if (!(await caller(req))) return json({ error: "unauthorized" }, 401);
  if (!process.env.GROQ_API_KEY) return json({ error: "no_key" }, 503);
  const { audio, types, lang } = (await req.json()) as { audio: string; types: { id: string; name: string }[]; lang?: string };
  const m = (audio || "").match(/^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i);
  if (!m || !Array.isArray(types)) return json({ error: "bad request" }, 400);
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length < 800) return json({ error: "too_short" }, 422);
  if (bytes.length > 4_000_000) return json({ error: "too_long" }, 413);

  const ext = m[1].includes("mp4") ? "mp4" : m[1].includes("ogg") ? "ogg" : m[1].includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: m[1] }), "voice." + ext);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", lang === "kk" ? "kk" : "ru");
  form.append("response_format", "json");
  form.append("temperature", "0");
  // подсказка модели: слова, которые встретятся в записи
  form.append("prompt", "Взвешивание пищевых отходов в столовой: " + types.map((t) => t.name).join(", ") + ". Килограммы, литры.");

  let text = "";
  try {
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + process.env.GROQ_API_KEY }, body: form });
    if (!r.ok) { console.error("groq:", r.status, (await r.text()).slice(0, 200)); return json({ error: "stt_failed" }, 502); }
    text = String(((await r.json()) as { text?: string }).text ?? "").trim();
  } catch (e) {
    console.error("groq:", (e as Error).message);
    return json({ error: "stt_failed" }, 502);
  }
  if (!text) return json({ text: "", typeId: null, quantity: 0 });
  const parsed = await parsePhrase(text, types);
  return json({ text, ...parsed });
}
