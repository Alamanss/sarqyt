// Презентация Sarqyt (Трек 1). Запуск: node presentation/build.cjs
// Цифры слайда 9 — из scripts/stats.mjs (принятые отчёты в демо-данных). Экономика — допущения команды.
const pptxgen = require("pptxgenjs");
const QRCode = require("qrcode");

const C = { ink: "16192C", brand: "2F55E6", tint: "EDF1FE", mute: "5D6577", faint: "8A93A6", line: "DFE3EA", wash: "F5F6F8", white: "FFFFFF", leaf: "0B7A5B", mint: "E7F5F0", clay: "C8324F", rose: "FDEAF0", amber: "8A5A00", sand: "FDF3DC" };
const FONT = "Arial";
const URL = "sarqyt-atu.vercel.app";

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9"; // 10 × 5.625 дюйма
  pres.author = "Команда Sarqyt"; pres.title = "Sarqyt — учёт пищевых отходов университетского комплекса";
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

  pres.defineSlideMaster({
    title: "CONTENT", background: { color: C.white }, margin: [0.5, 0.5, 0.5, 0.5],
    objects: [
      { text: { text: "Sarqyt · Трек 1 · Smart Food Industries", options: { x: 0.5, y: 5.2, w: 6, h: 0.25, fontFace: FONT, fontSize: 10, color: C.faint, margin: 0 } } },
      { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.4, w: 9, h: 0.95, fontFace: FONT, fontSize: 28, bold: true, color: C.ink, align: "left", valign: "top", margin: 0 }, text: "" } },
    ],
    slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.25, fontFace: FONT, fontSize: 10, color: C.faint, align: "right" },
  });
  pres.defineSlideMaster({ title: "DARK", background: { color: C.ink }, margin: [0.5, 0.5, 0.5, 0.5] });

  const T = (s, text, o) => s.addText(text, { fontFace: FONT, color: C.ink, margin: 0, isTextBox: true, valign: "top", ...o });
  const box = (s, x, y, w, h, fill = C.wash, line = null) => s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: line ? { color: line, width: 0.75 } : { color: fill, width: 0 } });
  const badge = (s, n, x, y, fill = C.brand) => { s.addShape(pres.ShapeType.ellipse, { x, y, w: 0.36, h: 0.36, fill: { color: fill }, line: { color: fill, width: 0 } }); T(s, String(n), { x, y, w: 0.36, h: 0.36, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle" }); };
  const stat = (s, x, y, w, big, label, color = C.ink) => { T(s, big, { x, y, w, h: 0.62, fontSize: 34, bold: true, color }); T(s, label, { x, y: y + 0.66, w, h: 0.55, fontSize: 12, color: C.mute }); };
  const logo = (s, x, y, size = 0.5) => { s.addShape(pres.ShapeType.roundRect, { x, y, w: size, h: size, rectRadius: 0.1, fill: { color: C.brand }, line: { color: C.brand, width: 0 } }); T(s, "S", { x, y, w: size, h: size, fontSize: size * 44, bold: true, color: C.white, align: "center", valign: "middle" }); };
  const content = (title, notes) => { const s = pres.addSlide({ masterName: "CONTENT" }); s.addText(title, { placeholder: "title" }); if (notes) s.addNotes(notes); return s; };

  // ---------- 1. Титул ----------
  {
    const s = pres.addSlide({ masterName: "DARK" });
    logo(s, 0.5, 0.5, 0.55);
    T(s, "Sarqyt", { x: 1.2, y: 0.5, w: 4, h: 0.55, fontSize: 24, bold: true, color: C.white, valign: "middle" });
    T(s, "Учёт пищевых отходов университета — без бумажных таблиц", { x: 0.5, y: 1.7, w: 8.2, h: 1.6, fontSize: 40, bold: true, color: C.white });
    T(s, "Цифровая система управления пищевыми отходами университетского комплекса АО «АТУ»", { x: 0.5, y: 3.45, w: 7.4, h: 0.7, fontSize: 16, color: "B9C1D9" });
    T(s, "Трек 1 · Digital Food Waste Management System for University Campuses", { x: 0.5, y: 4.55, w: 7, h: 0.3, fontSize: 12, color: "8A93B5" });
    T(s, "Хакатон Smart Food Industries · 12 ноября 2026 · Сейткопаров Аламан", { x: 0.5, y: 4.85, w: 7, h: 0.3, fontSize: 12, color: "8A93B5" });
    T(s, URL, { x: 6.5, y: 0.6, w: 3, h: 0.35, fontSize: 14, color: "B9C1D9", align: "right" });
    s.addNotes("В казахской традиции еду не выбрасывают: сарқыт — угощение, которое гости уносят с дастархана. Sarqyt возвращает эту привычку в учёт университетских столовых. Это работающая система, а не макет: в конце покажу её со смартфона.");
  }

  // ---------- 2. Проблема ----------
  {
    const s = content("Отходы пяти организаций АТУ считают на бумаге — общей картины нет", "Проблема из кейса: несколько подразделений ведут учёт в бумажных или разрозненных электронных таблицах по единому образцу, без общей базы и аналитики. Мировые цифры — из материалов хакатона (ФАО, ООН).");
    const rows = [["Экология", "Нет системного учёта переработки и данных для ESG-отчётности и ЦУР 12"], ["Финансы", "Перерасход на закупку лишних продуктов и дорогая утилизация"], ["Процесс", "Журналы сводят вручную, причин потерь не видно, меню и закупки планировать сложно"]];
    rows.forEach(([h, p], i) => { const y = 1.55 + i * 1.08; badge(s, i + 1, 0.5, y); T(s, h, { x: 1.05, y: y - 0.02, w: 4, h: 0.3, fontSize: 16, bold: true }); T(s, p, { x: 1.05, y: y + 0.32, w: 4.1, h: 0.6, fontSize: 13, color: C.mute }); });
    box(s, 5.7, 1.5, 3.8, 3.35, C.wash);
    stat(s, 5.95, 1.7, 1.5, "5", "организаций со своей таблицей", C.brand);
    stat(s, 7.7, 1.7, 1.6, "26", "видов отходов в образцах");
    stat(s, 5.95, 3.25, 1.5, "≈ ⅓", "продовольствия в мире теряется (ФАО)");
    stat(s, 7.7, 3.25, 1.6, "8–10 %", "выбросов парниковых газов (ООН)");
  }

  // ---------- 3. Аналоги ----------
  {
    const s = content("Аналоги считают отходы, но не закрывают цикл проверки и отчётности", "Winnow и Leanpath — системы для ресторанов и отелей: камера и весы над баком, требуют оборудования и подписки. Они измеряют отходы, но не ведут журнал по таблицам вуза и не дают цикл «сдал — проверили — приняли». Описания — по открытым материалам этих продуктов.");
    const head = ["", "Бумага и Excel", "Winnow, Leanpath", "Sarqyt"];
    const data = [
      ["Ввод со смартфона на месте", "нет", "нужны свои весы и камера", "да, три касания"],
      ["Проверка и статусы отчёта", "по почте, вручную", "нет", "да, с историей"],
      ["Таблицы по образцу АТУ", "да", "нет", "да"],
      ["Единый реестр и свод", "вручную", "частично", "автоматически"],
      ["CO₂ и рекомендации", "нет", "частично", "да, DEFRA 2024"],
      ["Подходит вузу без оборудования", "да", "нет", "да"],
    ];
    const cell = (t, o = {}) => ({ text: t, options: { fontFace: FONT, fontSize: 12, color: C.ink, valign: "middle", margin: [4, 8, 4, 8], ...o } });
    const rows = [head.map((h, i) => cell(h, { bold: true, color: i === 3 ? C.white : C.mute, fill: { color: i === 3 ? C.brand : C.wash } }))];
    data.forEach((r) => rows.push(r.map((t, i) => cell(t, i === 0 ? { bold: true } : i === 3 ? { fill: { color: C.tint }, bold: true, color: C.brand } : { color: C.mute }))));
    s.addTable(rows, { x: 0.5, y: 1.55, w: 9, colW: [2.9, 1.9, 2.2, 2.0], rowH: 0.47, border: { type: "solid", color: C.line, pt: 0.75 } });
  }

  // ---------- 4. Решение ----------
  {
    const s = content("Sarqyt: запись в три касания, отчёт за квартал — одной кнопкой", "Экран ввода повторяет знакомую бумажную таблицу: вес вписывается прямо в строку вида отхода, итоги система считает сама. ТЗ требует не больше 5 касаний и 30 секунд на запись — у нас три касания.");
    const items = [["3", "касания на запись со смартфона", C.brand], ["6", "способов ввода: форма, фото, голос, Telegram, весы, Excel или бланк", C.ink], ["4", "роли: ответственный, проверяющий, администратор, руководство", C.ink], ["2", "языка интерфейса: казахский и русский", C.ink]];
    items.forEach(([n, l, c], i) => { const x = 0.5 + i * 2.3; box(s, x, 1.55, 2.1, 1.75, i === 0 ? C.tint : C.wash); T(s, n, { x: x + 0.2, y: 1.7, w: 1.7, h: 0.7, fontSize: 40, bold: true, color: c }); T(s, l, { x: x + 0.2, y: 2.42, w: 1.75, h: 0.8, fontSize: 11, color: C.mute }); });
    T(s, "Что получает каждый", { x: 0.5, y: 3.6, w: 4, h: 0.3, fontSize: 14, bold: true });
    T(s, [
      { text: "Ответственный: ", options: { bold: true } }, { text: "вписывает веса в привычную таблицу, итоги за день и месяц считаются сами", options: { breakLine: true } },
      { text: "Проверяющий: ", options: { bold: true } }, { text: "принимает отчёт или возвращает с комментарием, вся история сохраняется", options: { breakLine: true } },
      { text: "Руководство: ", options: { bold: true } }, { text: "видит динамику, CO₂-эквивалент, отклонения и сводку с выводами" },
    ], { x: 0.5, y: 3.95, w: 9, h: 1.05, fontSize: 13, color: C.ink, paraSpaceAfter: 5 });
  }

  // ---------- 5. Технология и MVP ----------
  {
    const s = content("Полный цикл работает: сквозной сценарий ТЗ пройден, 17 проверок из 17", "Сценарий из раздела 9 ТЗ прогнан на живой системе автоматическим скриптом scripts/e2e.mjs: ввод, новый вид отхода, отправка, возврат с комментарием, повторная отправка, принятие, реестр, свод, несдавшие, подключение новой организации. Права по ролям заданы в базе данных, а не скрытием кнопок.");
    const steps = ["Форма", "Проверка", "Реестр", "Аналитика", "Отчёт"]; const sub = ["со смартфона", "принять / вернуть", "только принятое", "CO₂, отклонения", "Excel за квартал"];
    steps.forEach((t, i) => { const x = 0.5 + i * 1.82; box(s, x, 1.55, 1.6, 0.95, i === 0 ? C.brand : C.tint); T(s, t, { x, y: 1.68, w: 1.6, h: 0.32, fontSize: 15, bold: true, color: i === 0 ? C.white : C.brand, align: "center" }); T(s, sub[i], { x, y: 2.03, w: 1.6, h: 0.3, fontSize: 10.5, color: i === 0 ? "D5DDFB" : C.mute, align: "center" }); if (i < 4) T(s, "→", { x: x + 1.6, y: 1.8, w: 0.22, h: 0.4, fontSize: 16, color: C.faint, align: "center" }); });
    T(s, "Архитектура", { x: 0.5, y: 2.85, w: 4, h: 0.3, fontSize: 14, bold: true });
    T(s, [
      { text: "Next.js на Vercel", options: { bold: true } }, { text: " — веб-интерфейс и серверные функции, публичная ссылка", options: { breakLine: true } },
      { text: "Supabase: PostgreSQL, вход, хранилище фото", options: { bold: true } }, { text: " — права по ролям на уровне базы (RLS), пароли только в виде хеша", options: { breakLine: true } },
      { text: "Claude API", options: { bold: true } }, { text: " — распознавание отхода по фото, голос, OCR бланка, сводка для руководства", options: { breakLine: true } },
      { text: "Telegram Bot API и API весов", options: { bold: true } }, { text: " — ввод из мессенджера и стык с Треком 2" },
    ], { x: 0.5, y: 3.2, w: 6.5, h: 1.8, fontSize: 12, color: C.ink, paraSpaceAfter: 5 });
    const qr = await QRCode.toDataURL("https://" + URL, { width: 600, margin: 1, color: { dark: "#16192C", light: "#FFFFFF" } });
    box(s, 7.45, 2.85, 2.05, 2.2, C.white, C.line);
    s.addImage({ data: qr, x: 7.75, y: 2.95, w: 1.45, h: 1.45 });
    T(s, URL, { x: 7.45, y: 4.42, w: 2.05, h: 0.25, fontSize: 10.5, bold: true, align: "center" });
    T(s, "демо-входы на странице входа", { x: 7.45, y: 4.68, w: 2.05, h: 0.25, fontSize: 9.5, color: C.mute, align: "center" });
  }

  // ---------- 6. Как есть → как будет ----------
  {
    const s = content("Было: бумага и ручной свод. Стало: данные сразу в едином реестре", "Времена в колонке «было» — допущения команды, их нужно уточнить у ответственных лиц организаций на пилоте. Времена «стало» измерены на прототипе.");
    const col = (x, title, fill, tc, items) => { box(s, x, 1.5, 4.35, 2.95, fill); T(s, title, { x: x + 0.25, y: 1.62, w: 3.9, h: 0.3, fontSize: 14, bold: true, color: tc }); items.forEach(([a, b], i) => { const y = 2.02 + i * 0.47; T(s, a, { x: x + 0.25, y, w: 2.75, h: 0.42, fontSize: 11.5, color: C.ink }); T(s, b, { x: x + 3.0, y, w: 1.15, h: 0.42, fontSize: 11.5, bold: true, color: tc, align: "right" }); }); };
    col(0.5, "Как есть: бумажная таблица", C.wash, C.mute, [["Запись взвешивания в бланк", "≈ 2 мин"], ["Перенос бланка в Excel, на организацию", "≈ 2 ч / мес"], ["Сведение пяти таблиц проверяющим", "≈ 8 ч / мес"], ["Квартальный отчёт вручную", "≈ 16 ч"], ["Аналитика и CO₂", "нет"]]);
    col(5.15, "Как будет: Sarqyt", C.tint, C.brand, [["Запись со смартфона, три касания", "≈ 10 с"], ["Отправка отчёта на проверку", "1 кнопка"], ["Реестр и свод по всем организациям", "автоматически"], ["Квартальный отчёт в Excel", "≈ 1 мин"], ["Аналитика и CO₂", "сразу"]]);
    T(s, "→", { x: 4.85, y: 2.7, w: 0.3, h: 0.4, fontSize: 18, color: C.faint, align: "center" });
    T(s, [{ text: "≈ 50 часов в месяц", options: { bold: true, color: C.brand } }, { text: " высвобождается у пяти организаций и проверяющего — оценка команды по этим допущениям" }], { x: 0.5, y: 4.6, w: 9, h: 0.4, fontSize: 13 });
  }

  // ---------- 7. Бизнес-модель ----------
  {
    const s = content("Бизнес-модель: внутренний продукт АТУ, затем подписка для вузов", "Первый заказчик — сам АТУ: система закрывает его задачу учёта. Тиражирование — через Союз пищевых предприятий Казахстана и вузы с собственными столовыми. Цена подписки — допущение для расчёта, на пилоте уточняется.");
    const cols = [["Потребители", ["АТУ: столовые, кофейня, ATU INN, кафедры", "Вузы и колледжи с общепитом на кампусе", "Сети столовых и корпоративное питание"]], ["Каналы", ["Пилот и внедрение в АТУ", "Союз пищевых предприятий Казахстана", "ESG-отчётность вузов, ЦУР 12.3"]], ["Доход", ["АТУ: внедрение и сопровождение", "Подписка на кампус: ≈ 120 тыс ₸ в месяц", "Подключение весов и интеграций — отдельно"]]];
    cols.forEach(([h, items], i) => { const x = 0.5 + i * 3.05; box(s, x, 1.55, 2.9, 3.2, i === 2 ? C.tint : C.wash); T(s, h, { x: x + 0.25, y: 1.72, w: 2.4, h: 0.32, fontSize: 16, bold: true, color: i === 2 ? C.brand : C.ink }); T(s, items.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < items.length - 1 } })), { x: x + 0.25, y: 2.2, w: 2.45, h: 2.4, fontSize: 12.5, color: C.ink, paraSpaceAfter: 8 }); });
  }

  // ---------- 8. Экономика ----------
  {
    const s = content("Окупаемость — около года при пилоте на пяти организациях АТУ", "Все суммы — укрупнённые допущения команды: ставка 2 500 ₸ в час, сокращение отходов на 5 % за счёт аналитики, средняя стоимость продуктов 1 200 ₸ за кг. Хостинг: тарифы Vercel и Supabase. На пилоте допущения заменяются фактом.");
    const cards = [["CAPEX", "1,3 млн ₸", "доработка MVP до промышленной версии и обучение пяти организаций", C.wash, C.ink], ["OPEX", "80 тыс ₸ / мес", "хостинг и база ≈ 25, ИИ-запросы ≈ 5, сопровождение ≈ 50", C.wash, C.ink], ["Эффект", "190 тыс ₸ / мес", "50 ч труда ≈ 125 и сокращение отходов на 5 % ≈ 65", C.tint, C.brand], ["Окупаемость", "≈ 12 месяцев", "1,3 млн ÷ (190 − 80) тыс ₸ в месяц", C.mint, C.leaf]];
    cards.forEach(([h, big, sub, fill, col], i) => { const x = 0.5 + i * 2.3; box(s, x, 1.55, 2.1, 2.25, fill); T(s, h, { x: x + 0.2, y: 1.7, w: 1.7, h: 0.28, fontSize: 12, color: C.mute }); T(s, big, { x: x + 0.2, y: 2.02, w: 1.8, h: 0.75, fontSize: 20, bold: true, color: col }); T(s, sub, { x: x + 0.2, y: 2.82, w: 1.75, h: 0.9, fontSize: 10.5, color: C.mute }); });
    T(s, "Тиражирование", { x: 0.5, y: 4.02, w: 3, h: 0.3, fontSize: 14, bold: true });
    T(s, "Для второго вуза CAPEX не повторяется: новая организация и её виды отходов подключаются через интерфейс администратора, без изменения кода.", { x: 0.5, y: 4.35, w: 9, h: 0.6, fontSize: 13, color: C.ink });
  }

  // ---------- 9. Экология ----------
  {
    const s = content("Экология: 3,1 т CO₂-экв можно не выбросить, сменив способ утилизации", "Цифры — по демо-данным, сгенерированным по образцам таблиц АТУ за июль–ноябрь 2026, это не фактические данные университета. Формула справочника Оргкомитета: экономия = масса в тоннах × (коэффициент ТБО − коэффициент нового способа). Коэффициенты DEFRA 2024: пищевые отходы на полигоне 700,21, компостирование 8,88 кг CO₂-экв на тонну.");
    s.addChart(pres.charts.BAR, [{ name: "Отходы, кг", labels: ["июль", "август", "сентябрь", "октябрь"], values: [927, 1019, 1123, 1332] }], {
      x: 0.5, y: 1.5, w: 4.9, h: 3.3, barDir: "col", chartColors: [C.brand], showLegend: false, showTitle: true, title: "Масса отходов по месяцам, кг", titleFontFace: FONT, titleFontSize: 12, titleColor: C.mute,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontFace: FONT, dataLabelFontSize: 11, dataLabelColor: C.ink, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 11, catAxisLabelColor: C.mute, valAxisHidden: true, valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" }, barGapWidthPct: 60,
    });
    const st = [["4,5 т", "отходов учтено в реестре", C.ink, C.wash], ["3,2 т", "CO₂-экв при вывозе на полигон", C.ink, C.wash], ["−3,1 т", "CO₂-экв при рекомендуемых способах", C.leaf, C.mint], ["3,6 %", "уже уходит на переработку", C.ink, C.wash]];
    st.forEach(([b, l, col, fill], i) => { const x = 5.7 + (i % 2) * 1.95, y = 1.5 + Math.floor(i / 2) * 1.45; box(s, x, y, 1.8, 1.3, fill); T(s, b, { x: x + 0.15, y: y + 0.13, w: 1.6, h: 0.5, fontSize: 24, bold: true, color: col }); T(s, l, { x: x + 0.15, y: y + 0.68, w: 1.55, h: 0.55, fontSize: 10.5, color: C.mute }); });
    T(s, "Вклад в ЦУР 12.3. Расчёт по DEFRA 2024; демо-данные по образцам таблиц АТУ", { x: 5.7, y: 4.45, w: 3.8, h: 0.4, fontSize: 10, color: C.mute });
  }

  // ---------- 10. Внедрение ----------
  {
    const s = content("Внедрение: пилот в одной столовой, затем кампус, затем другие вузы", "Сроки и ресурсы — план команды. Главный риск — люди не станут вносить данные: поэтому экран повторяет бумажную таблицу, а ввод занимает секунды.");
    const st = [["Этап 1 · 1 месяц", "Пилот", "Столовый комплекс корп. 1, 2: реальные взвешивания, замер времени ввода, сверка с бумажным журналом"], ["Этап 2 · 2–3 месяца", "Весь кампус АТУ", "Пять организаций, обучение ответственных, первый квартальный отчёт из системы"], ["Этап 3 · 6–12 месяцев", "Другие вузы", "Подключение новых кампусов через интерфейс, интеграция с электронными весами"]];
    st.forEach(([when, h, p], i) => { const x = 0.5 + i * 3.05; box(s, x, 1.5, 2.9, 1.85, i === 0 ? C.tint : C.wash); T(s, when, { x: x + 0.22, y: 1.63, w: 2.5, h: 0.25, fontSize: 10.5, color: i === 0 ? C.brand : C.mute }); T(s, h, { x: x + 0.22, y: 1.9, w: 2.5, h: 0.32, fontSize: 16, bold: true }); T(s, p, { x: x + 0.22, y: 2.28, w: 2.5, h: 1.0, fontSize: 11, color: C.mute }); });
    T(s, "Риски и как их снижаем", { x: 0.5, y: 3.55, w: 5, h: 0.3, fontSize: 14, bold: true });
    const risks = [["Персонал не вносит данные", "экран как бумажная таблица, три касания, напоминания в Telegram"], ["Ошибки ввода и ИИ", "проверка значений, подтверждение человеком, цикл проверки отчёта"], ["Коэффициенты CO₂ британские", "справочник редактируется, заменяем на казахстанские при появлении"]];
    risks.forEach(([r, m], i) => { const y = 3.92 + i * 0.36; T(s, r, { x: 0.5, y, w: 3.1, h: 0.32, fontSize: 11.5, bold: true }); T(s, m, { x: 3.7, y, w: 5.8, h: 0.32, fontSize: 11.5, color: C.mute }); });
  }

  // ---------- 11. Команда и запрос ----------
  {
    const s = content("Команда и запрос: пилот в одной организации АТУ на реальных данных", "Генеративный ИИ использовался как вспомогательный инструмент при написании кода (Claude Code) и внутри продукта (Claude API). Концепция, расчёты и защита — работа команды. Данные в системе — демонстрационные.");
    box(s, 0.5, 1.55, 4.3, 2.2, C.wash);
    T(s, "Команда", { x: 0.75, y: 1.7, w: 3, h: 0.28, fontSize: 12, color: C.mute });
    T(s, "Сейткопаров Аламан", { x: 0.75, y: 2.0, w: 3.8, h: 0.4, fontSize: 20, bold: true });
    T(s, "Продукт, проектирование интерфейса, разработка, данные и расчёты", { x: 0.75, y: 2.45, w: 3.8, h: 0.6, fontSize: 12.5, color: C.mute });
    T(s, "ИИ-инструменты: Claude Code при разработке, Claude API внутри продукта", { x: 0.75, y: 3.1, w: 3.8, h: 0.55, fontSize: 11, color: C.mute });
    box(s, 5.0, 1.55, 4.5, 2.2, C.tint);
    T(s, "Запрос", { x: 5.25, y: 1.7, w: 3, h: 0.28, fontSize: 12, color: C.brand });
    T(s, ["Пилот в одной организации АТУ на один месяц", "Доступ к реальным таблицам учёта за семестр", "Консультация технолога по способам переработки"].map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < 2 } })), { x: 5.25, y: 2.02, w: 4.0, h: 1.6, fontSize: 13.5, color: C.ink, paraSpaceAfter: 8 });
    T(s, "Сарқыт — угощение, которое гости уносят с дастархана. В казахской традиции еду не выбрасывают, а передают дальше.", { x: 0.5, y: 4.0, w: 9, h: 0.7, fontSize: 14, italic: true, color: C.ink });
  }

  await pres.writeFile({ fileName: "presentation/Sarqyt-Track1.pptx" });
  console.log("written presentation/Sarqyt-Track1.pptx");
})();
