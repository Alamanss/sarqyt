import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const a = await db.from("waste_types").select("name_ru, co2_landfill, recommended_disposal_id").limit(2);
console.log("migration2:", a.error ? "НЕ выполнена (" + a.error.message + ")" : "выполнена", a.data?.[0] ?? "");
const b = await db.from("disposal_methods").select("name_ru, code");
console.log("methods:", b.error?.message ?? b.data.map((x) => x.code).join(","));
const c = await db.storage.getBucket("photos"); console.log("bucket:", c.error ? c.error.message : "ok");
