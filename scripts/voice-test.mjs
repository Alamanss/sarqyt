// Проверка голосового ввода на живом сайте: звуковой файл → Groq Whisper → Claude
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const base = "https://sarqyt-atu.vercel.app";
const pw = fs.readFileSync(new URL("./seed.mjs", import.meta.url), "utf8").match(/DEMO_PASSWORD = "([^"]+)"/)[1];
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await c.auth.signInWithPassword({ email: "iskander@atu.demo", password: pw }); if (error) throw error;
const { data: prof } = await c.from("profiles").select("org_id").eq("id", data.user.id).single();
const { data: types } = await c.from("waste_types").select("id,name_ru").eq("org_id", prof.org_id).eq("active", true);
const audio = "data:audio/wav;base64," + fs.readFileSync(process.argv[2]).toString("base64");
const t0 = Date.now();
const r = await fetch(base + "/api/ai/voice", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + data.session.access_token }, body: JSON.stringify({ audio, lang: "ru", types: types.map((t) => ({ id: t.id, name: t.name_ru })) }) });
const j = await r.json();
console.log(r.status, Date.now() - t0 + " мс", JSON.stringify({ text: j.text, type: types.find((t) => t.id === j.typeId)?.name_ru ?? null, quantity: j.quantity, error: j.error }));
