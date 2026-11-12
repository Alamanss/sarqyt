import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export type Role = "responsible" | "reviewer" | "admin" | "management";
export type Status = "draft" | "submitted" | "in_review" | "accepted" | "returned";

export type Org = { id: string; slug: string; name_ru: string; name_kk: string; type: string; building: string | null; active: boolean };
export type Profile = { id: string; full_name: string; email: string | null; role: Role; org_id: string | null; telegram_chat_id: number | null };
export type Disposal = { id: string; name_ru: string; name_kk: string; is_recycling: boolean; code?: string | null; co2_factor?: number | null; hierarchy?: number | null };
export type WasteType = { id: string; org_id: string | null; name_ru: string; name_kk: string | null; unit: "kg" | "l"; default_disposal_id: string | null; recyclable: boolean; co2_factor: number; active: boolean; category?: string | null; recyclability?: "yes" | "partial" | "no"; recommended_disposal_id?: string | null; co2_landfill?: number; co2_recommended?: number };
export type Report = { id: string; org_id: string; period_start: string; period_end: string; status: Status; submitted_at: string | null; reviewer_id: string | null; decided_at: string | null };
export type Entry = { id: string; report_id: string; org_id: string; entry_date: string; waste_type_id: string; quantity: number; disposal_id: string | null; responsible_id: string | null; photo_url: string | null; source: string; note: string | null; created_at: string };
export type History = { id: string; report_id: string; from_status: string | null; to_status: string; user_id: string | null; comment: string | null; created_at: string };

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const monthStart = (iso: string) => iso.slice(0, 7) + "-01";
export const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("ru-RU", { maximumFractionDigits: 1 });

/** Масса записи в тоннах (масло: 1 л ≈ 0,92 кг — допущение справочника Оргкомитета) */
export const tons = (e: { quantity: number }, t?: WasteType) => (Number(e.quantity) * (t?.unit === "l" ? 0.92 : 1)) / 1000;

/** CO₂-экв. записи, кг: фактический (по выбранному способу) и потенциальная экономия при рекомендуемом способе */
export function co2(e: Entry, t: WasteType | undefined, d: Disposal | undefined) {
  const m = tons(e, t);
  const landfill = Number(t?.co2_landfill ?? 700.21), rec = Number(t?.co2_recommended ?? 8.88);
  const isLandfill = !d || !d.code || d.code === "TBO";
  const factor = isLandfill ? landfill : Number(d.co2_factor ?? rec);
  return { actual: m * factor, baseline: m * landfill, saved: m * (landfill - factor), potential: isLandfill ? m * (landfill - rec) : 0 };
}
