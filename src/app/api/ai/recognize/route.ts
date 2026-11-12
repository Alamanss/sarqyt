import { askJson, caller, imagePart, json } from "@/lib/server";

// Фото отходов → вид отхода из справочника организации
export async function POST(req: Request) {
  if (!(await caller(req))) return json({ error: "unauthorized" }, 401);
  const { image, types } = (await req.json()) as { image: string; types: { id: string; name: string }[] };
  const img = imagePart(image || "");
  if (!img || !Array.isArray(types)) return json({ error: "bad request" }, 400);
  const list = types.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
  const r = await askJson(
    "Ты помогаешь вести учёт пищевых отходов столовой университета. По фото определи вид отхода.",
    [img, { type: "text", text: `Справочник видов отходов:\n${list}\n\nВерни JSON: {"index": номер из справочника или 0 если ничего не подходит, "confidence": число от 0 до 1, "suggest": "короткое название вида отхода по-русски, если в справочнике нет подходящего, иначе пустая строка"}` }],
  );
  if (!r) return json({ typeId: null });
  const idx = Number(r.index) - 1;
  const conf = Number(r.confidence) || 0;
  if (idx >= 0 && idx < types.length && conf >= 0.4) return json({ typeId: types[idx].id, confidence: conf });
  return json({ typeId: null, suggest: String(r.suggest || "") });
}
