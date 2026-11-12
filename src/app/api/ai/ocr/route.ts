import { askJson, caller, imagePart, json } from "@/lib/server";

// Фото заполненного бумажного бланка → строки журнала
export async function POST(req: Request) {
  if (!(await caller(req))) return json({ error: "unauthorized" }, 401);
  const { image, types, month } = (await req.json()) as { image: string; types: { id: string; name: string }[]; month: string };
  const img = imagePart(image || "");
  if (!img || !Array.isArray(types)) return json({ error: "bad request" }, 400);
  const list = types.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
  const r = await askJson(
    "Ты распознаёшь бумажную «Таблицу учёта пищевых отходов» университета. Колонки: дата, наименование отходов, вес (кг) / объём (л), способ утилизации, ответственное лицо.",
    [img, { type: "text", text: `Справочник видов отходов:\n${list}\n\nМесяц отчёта: ${month} (если в дате нет года или месяца — подставь из него).\nВерни JSON: {"rows": [{"date": "ГГГГ-ММ-ДД", "index": номер вида из справочника или 0, "name": "как написано в бланке", "quantity": число}]}. Пропусти пустые и итоговые строки.` }],
    2000,
  );
  const rows = Array.isArray(r?.rows) ? (r!.rows as { date: string; index: number; name: string; quantity: number }[]) : [];
  return json({
    rows: rows.filter((x) => Number(x.quantity) > 0).map((x) => ({
      date: String(x.date || ""), name: String(x.name || ""), quantity: Number(x.quantity),
      typeId: x.index >= 1 && x.index <= types.length ? types[x.index - 1].id : null,
    })),
  });
}
