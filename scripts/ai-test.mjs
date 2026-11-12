// Проверка ИИ-функций на живом сайте под демо-пользователем
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const seed = fs.readFileSync(new URL("./seed.mjs", import.meta.url), "utf8");
const pw = seed.match(/DEMO_PASSWORD = "([^"]+)"/)[1];
const base = process.argv[2] || "https://zerowaste-atu.vercel.app";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await db.auth.signInWithPassword({ email: "iskander@atu.demo", password: pw });
if (error) throw error;
const token = data.session.access_token;
const { data: types } = await db.from("waste_types").select("id,name_ru,org_id").eq("active", true);
const mine = types.filter((t) => t.org_id).slice(0, 40).map((t) => ({ id: t.id, name: t.name_ru }));
const call = async (path, body) => { const t0 = Date.now(); const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify(body) }); return [r.status, await r.json(), Date.now() - t0 + "ms"]; };
const name = (id) => mine.find((t) => t.id === id)?.name ?? id;
for (const text of ["три с половиной кило очистков", "масло два литра", "картон 1.2"]) {
  const [st, j, ms] = await call("/api/ai/parse", { text, types: mine });
  console.log("parse", st, ms, JSON.stringify(text), "→", name(j.typeId), j.quantity);
}
const [st] = await call("/api/ai/parse", { text: "x" , types: null }); console.log("bad request →", st);
const r = await fetch(base + "/api/ai/parse", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); console.log("no token →", r.status);
if (process.argv[3]) {
  const img = "data:image/jpeg;base64," + fs.readFileSync(process.argv[3]).toString("base64");
  const [s2, j2, ms2] = await call("/api/ai/recognize", { image: img, types: mine });
  console.log("recognize", s2, ms2, name(j2.typeId), j2.confidence ?? "", j2.suggest ?? "");
}
