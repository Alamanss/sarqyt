// Переносит переменные из .env.local в Vercel (production), не печатая значения.
import { spawnSync } from "node:child_process";
const names = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "TELEGRAM_BOT_TOKEN", "SCALE_API_KEY"];
for (const n of names) {
  const v = process.env[n];
  if (!v) { console.log("skip (empty):", n); continue; }
  spawnSync("vercel", ["env", "rm", n, "production", "--yes"], { shell: true, stdio: "ignore" });
  const r = spawnSync("vercel", ["env", "add", n, "production"], { shell: true, input: v, encoding: "utf8" });
  console.log(r.status === 0 ? "set:" : "FAILED:", n);
}
