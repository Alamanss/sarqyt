import { caller, json, parsePhrase } from "@/lib/server";

// Фраза («три с половиной кило очистков») → вид отхода и количество
export async function POST(req: Request) {
  if (!(await caller(req))) return json({ error: "unauthorized" }, 401);
  const { text, types } = (await req.json()) as { text: string; types: { id: string; name: string }[] };
  if (!text || !Array.isArray(types)) return json({ error: "bad request" }, 400);
  return json(await parsePhrase(text, types));
}
