import { askJson, caller, json } from "@/lib/server";

// Сводка для руководства: ИИ формулирует вывод по уже посчитанным цифрам реестра.
// Модель не считает и не добавляет данных — только пересказывает переданные показатели.
export async function POST(req: Request) {
  if (!(await caller(req))) return json({ error: "unauthorized" }, 401);
  const data = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return json({ error: "bad request" }, 400);
  const kk = data.lang === "kk";
  const r = await askJson(
    [
      "Ты аналитик системы учёта пищевых отходов университета. Пишешь короткую сводку для руководства.",
      "Жёсткие правила:",
      "- Используй ТОЛЬКО числа из переданных данных. Ничего не досчитывай и не придумывай: ни процентов, ни денег, ни причин, которых нет в данных.",
      "- Если причина роста неизвестна, так и скажи: «причину нужно выяснить у ответственного».",
      "- Рекомендуй только способы из поля potential (method). Не предлагай использовать отходы в пищу.",
      "- Тон деловой, без восклицаний и оценочных эпитетов. Числа с единицами измерения.",
      `- Язык ответа: ${kk ? "казахский" : "русский"}.`,
    ].join("\n"),
    `Данные (JSON):\n${JSON.stringify(data).slice(0, 6000)}\n\nВерни JSON: {"text": "сводка из 3–4 предложений: общий объём и динамика, главное отклонение, экологический итог", "actions": ["до трёх конкретных действий на следующий месяц, каждое одной фразой с числом из данных"]}`,
    1600,
  );
  if (!r || typeof r.text !== "string") return json({ text: null });
  return json({ text: r.text, actions: Array.isArray(r.actions) ? r.actions.filter((x) => typeof x === "string").slice(0, 3) : [] });
}
