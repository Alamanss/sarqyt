// Убирает тестовые виды отходов, добавленные вручную при проверке (деактивация, не удаление)
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await db.from("waste_types").select("id,name_ru,category").is("category", null);
for (const t of data ?? []) { const { count } = await db.from("entries").select("id", { count: "exact", head: true }).eq("waste_type_id", t.id); if (!count) { await db.from("waste_types").delete().eq("id", t.id); console.log("removed:", t.name_ru); } else { console.log("kept (has entries):", t.name_ru); } }
