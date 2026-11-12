import { admin, caller, json } from "@/lib/server";

// Создание пользователя администратором: роль и организация назначаются на сервере
export async function POST(req: Request) {
  const me = await caller(req);
  if (me?.role !== "admin") return json({ error: "forbidden" }, 403);
  const b = (await req.json()) as { email: string; password: string; full_name: string; role: string; org_id: string | null };
  if (!b.email || !b.password || b.password.length < 8 || !["responsible", "reviewer", "admin", "management"].includes(b.role))
    return json({ error: "Проверьте e-mail, пароль (от 8 символов) и роль" }, 400);
  if (b.role === "responsible" && !b.org_id) return json({ error: "Ответственному лицу нужна организация" }, 400);
  const db = admin();
  const { data, error } = await db.auth.admin.createUser({ email: b.email.trim(), password: b.password, email_confirm: true, user_metadata: { full_name: b.full_name } });
  if (error) return json({ error: error.message }, 400);
  const { error: e2 } = await db.from("profiles").upsert({
    id: data.user.id, email: b.email.trim(), full_name: b.full_name || "", role: b.role, org_id: b.role === "responsible" ? b.org_id : null,
  });
  if (e2) return json({ error: e2.message }, 400);
  return json({ ok: true });
}
