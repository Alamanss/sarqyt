// Имитация электронных весов (стык с Треком 2). Запуск: node --env-file=.env.local scripts/scale-demo.mjs [адрес] [org] [вид] [вес]
const [base = "https://zerowaste-atu.vercel.app", org = "iskander", waste = "Очистки овощей", weight = "3.7"] = process.argv.slice(2);
const r = await fetch(base + "/api/scale", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.SCALE_API_KEY }, body: JSON.stringify({ org, waste, weight: Number(weight), device: "scale-demo-01" }) });
console.log(r.status, await r.json());
