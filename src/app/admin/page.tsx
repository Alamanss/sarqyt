"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, QrCode } from "lucide-react";
import { PageHead, Shell } from "@/components/Shell";
import { useI18n, nm, type Key } from "@/lib/i18n";
import { supabase, type Disposal, type Org, type Profile, type Role, type WasteType } from "@/lib/supabase";
import { api, loadRefs } from "@/lib/data";

const ORG_TYPES: [string, string, string][] = [
  ["department", "Кафедра", "Кафедра"], ["canteen", "Столовая", "Асхана"], ["coffee", "Кофейня", "Кофехана"],
  ["hotel", "Гостиница", "Қонақүй"], ["lab", "Лаборатория", "Зертхана"], ["other", "Другое", "Басқа"],
];
const ROLES: Role[] = ["responsible", "reviewer", "admin", "management"];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/[а-яё]/g, (c) => "abvgdeezzijklmnoprstufhccss-y-eua"["абвгдеёжзийклмнопрстуфхцчшщъыьэюя".indexOf(c)] ?? "").replace(/^-+|-+$/g, "").slice(0, 30) || "org";

function Admin() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<"orgs" | "users" | "types" | "tools">("orgs");
  const [refs, setRefs] = useState<{ orgs: Org[]; types: WasteType[]; disposals: Disposal[] }>({ orgs: [], types: [], disposals: [] });
  const [users, setUsers] = useState<Profile[]>([]);
  const [msg, setMsg] = useState("");
  const [qr, setQr] = useState<{ org: Org; url: string; img: string } | null>(null);

  const load = useCallback(async () => {
    setRefs(await loadRefs());
    const { data } = await supabase.from("profiles").select("*").order("role");
    setUsers((data ?? []) as Profile[]);
  }, []);
  useEffect(() => { load(); }, [load]);
  const orgById = useMemo(() => Object.fromEntries(refs.orgs.map((o) => [o.id, o])), [refs.orgs]);
  const dispById = useMemo(() => Object.fromEntries(refs.disposals.map((o) => [o.id, o])), [refs.disposals]);

  // --- организации
  const [oName, setOName] = useState(""); const [oType, setOType] = useState("canteen"); const [oBld, setOBld] = useState("");
  async function addOrg() {
    if (!oName.trim()) return;
    const { error } = await supabase.from("organizations").insert({ slug: slugify(oName) + "-" + Math.random().toString(36).slice(2, 5), name_ru: oName.trim(), name_kk: oName.trim(), type: oType, building: oBld || null });
    setMsg(error ? error.message : (lang === "kk" ? "Сақталды" : "Сохранено")); setOName(""); setOBld(""); load();
  }
  async function toggleOrg(o: Org) { await supabase.from("organizations").update({ active: !o.active }).eq("id", o.id); load(); }
  async function showQr(o: Org) {
    const url = `${window.location.origin}/entry?org=${o.slug}`;
    setQr({ org: o, url, img: await QRCode.toDataURL(url, { width: 520, margin: 2, color: { dark: "#0f3a28", light: "#ffffff" } }) });
  }

  // --- пользователи
  const [u, setU] = useState({ email: "", password: "", full_name: "", role: "responsible" as Role, org_id: "" });
  async function addUser() {
    const r = await api("/api/admin/users", { ...u, org_id: u.org_id || null });
    setMsg(r.error ?? (lang === "kk" ? "Пайдаланушы құрылды" : "Пользователь создан")); if (!r.error) { setU({ email: "", password: "", full_name: "", role: "responsible", org_id: "" }); load(); }
  }
  async function setUser(id: string, patch: Partial<Profile>) { await supabase.from("profiles").update(patch).eq("id", id); load(); }

  // --- виды отходов
  const [w, setW] = useState({ name: "", unit: "kg", org_id: "", disposal: "" });
  async function addType() {
    if (!w.name.trim()) return;
    const { error } = await supabase.from("waste_types").insert({ name_ru: w.name.trim(), name_kk: w.name.trim(), unit: w.unit, org_id: w.org_id || null, default_disposal_id: w.disposal || refs.disposals.find((d) => d.code === "TBO")?.id || null, co2_factor: 0.70021 });
    setMsg(error ? error.message : (lang === "kk" ? "Сақталды" : "Сохранено")); setW({ ...w, name: "" }); load();
  }
  async function toggleType(x: WasteType) { await supabase.from("waste_types").update({ active: !x.active }).eq("id", x.id); load(); }

  // --- инструменты
  const [remind, setRemind] = useState("");
  async function sendReminders() { const r = await api("/api/remind", {}); setRemind(r.error ?? `Отправлено: ${r.sent ?? 0}. Без Telegram: ${r.noTelegram ?? 0}. Должники: ${(r.missing ?? []).join("; ") || "нет"}`); }

  return (
    <>
      <PageHead title={t("navAdmin")} sub={lang === "kk" ? "Ұйымдар, пайдаланушылар, анықтамалықтар және интеграциялар" : "Организации, пользователи, справочники и интеграции"} />
      <div className="seg mb-6 flex-wrap">
        {([["orgs", t("adminOrgs")], ["users", t("adminUsers")], ["types", t("adminTypes")], ["tools", lang === "kk" ? "Интеграциялар" : "Интеграции"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setTab(k); setMsg(""); }} className={tab === k ? "seg-on" : "seg-off"}>{label}</button>
        ))}
      </div>
      {msg && <p className="note note-ok mb-4" role="status">{msg}</p>}

      {tab === "orgs" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="card overflow-x-auto !p-0">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-line bg-wash"><tr><th className="th">{t("name")}</th><th className="th">{t("type")}</th><th className="th">{t("building")}</th><th className="th">{t("active")}</th><th className="th">QR</th></tr></thead>
              <tbody className="divide-y divide-line">
                {refs.orgs.map((o) => (
                  <tr key={o.id} className={o.active ? "" : "opacity-50"}>
                    <td className="td font-semibold">{nm(o, lang)}<div className="text-[12px] font-normal text-mute">{users.filter((x) => x.org_id === o.id).map((x) => x.full_name).join(", ") || "—"}</div></td>
                    <td className="td">{ORG_TYPES.find((x) => x[0] === o.type)?.[lang === "kk" ? 2 : 1]}</td>
                    <td className="td text-mute">{o.building ?? "—"}</td>
                    <td className="td"><input type="checkbox" className="h-4 w-4 accent-[#16192c]" checked={o.active} onChange={() => toggleOrg(o)} aria-label={t("active")} /></td>
                    <td className="td"><button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-[#d5dbe1] px-2 py-1 text-[14px] font-semibold hover:bg-wash" onClick={() => showQr(o)}><QrCode className="h-3.5 w-3.5" />QR</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card h-fit">
            <h2 className="h2 mb-4">{lang === "kk" ? "Жаңа ұйым" : "Новая организация"}</h2>
            <label className="label">{t("name")}</label><input className="field mb-2" value={oName} onChange={(e) => setOName(e.target.value)} />
            <label className="label">{t("type")}</label>
            <select className="field mb-2" value={oType} onChange={(e) => setOType(e.target.value)}>{ORG_TYPES.map((x) => <option key={x[0]} value={x[0]}>{x[lang === "kk" ? 2 : 1]}</option>)}</select>
            <label className="label">{t("building")}</label><input className="field mb-3" value={oBld} onChange={(e) => setOBld(e.target.value)} />
            <button type="button" className="btn-primary w-full" onClick={addOrg}>{t("create")}</button>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="card overflow-x-auto !p-0">
            <table className="w-full min-w-[620px]">
              <thead className="border-b border-line bg-wash"><tr><th className="th">{t("fullName")}</th><th className="th">{t("role")}</th><th className="th">{t("organization")}</th><th className="th">Telegram</th></tr></thead>
              <tbody className="divide-y divide-line">
                {users.map((x) => (
                  <tr key={x.id}>
                    <td className="td font-semibold">{x.full_name}<div className="text-[12px] font-normal text-mute">{x.email}</div></td>
                    <td className="td"><select className="field !min-h-9 !w-auto !text-[14px]" value={x.role} onChange={(e) => setUser(x.id, { role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{t(("role_" + r) as Key)}</option>)}</select></td>
                    <td className="td"><select className="field !min-h-9 !text-[14px]" value={x.org_id ?? ""} onChange={(e) => setUser(x.id, { org_id: e.target.value || null })}><option value="">—</option>{refs.orgs.map((o) => <option key={o.id} value={o.id}>{nm(o, lang)}</option>)}</select></td>
                    <td className="td text-mute">{x.telegram_chat_id ? <Check className="h-4 w-4 text-leaf" /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card h-fit">
            <h2 className="h2 mb-4">{lang === "kk" ? "Жаңа пайдаланушы" : "Новый пользователь"}</h2>
            <label className="label">{t("fullName")}</label><input className="field mb-2" value={u.full_name} onChange={(e) => setU({ ...u, full_name: e.target.value })} />
            <label className="label">{t("email")}</label><input className="field mb-2" type="email" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} />
            <label className="label">{t("password")}</label><input className="field mb-2" type="text" autoComplete="off" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} />
            <label className="label">{t("role")}</label>
            <select className="field mb-2" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{t(("role_" + r) as Key)}</option>)}</select>
            {u.role === "responsible" && (<><label className="label">{t("organization")}</label>
              <select className="field mb-2" value={u.org_id} onChange={(e) => setU({ ...u, org_id: e.target.value })}><option value="">—</option>{refs.orgs.map((o) => <option key={o.id} value={o.id}>{nm(o, lang)}</option>)}</select></>)}
            <button type="button" className="btn-primary mt-1 w-full" onClick={addUser}>{t("create")}</button>
          </div>
        </div>
      )}

      {tab === "types" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="card overflow-x-auto !p-0">
            <table className="w-full min-w-[680px]">
              <thead className="border-b border-line bg-wash"><tr><th className="th">{t("wasteType")}</th><th className="th">{t("organization")}</th><th className="th">{t("unit")}</th><th className="th">{lang === "kk" ? "Ұсынылатын тәсіл" : "Рекомендуемый способ"}</th><th className="th text-right">CO₂e/т</th><th className="th">{t("active")}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {refs.types.map((x) => (
                  <tr key={x.id} className={x.active ? "" : "opacity-50"}>
                    <td className="td font-semibold">{nm(x, lang)}</td>
                    <td className="td text-mute">{x.org_id ? nm(orgById[x.org_id], lang) : t("all")}</td>
                    <td className="td">{t(x.unit)}</td>
                    <td className="td text-mute">{nm(dispById[x.recommended_disposal_id ?? ""], lang)}</td>
                    <td className="td num text-right">{x.co2_landfill ?? "—"}</td>
                    <td className="td"><input type="checkbox" className="h-4 w-4 accent-[#16192c]" checked={x.active} onChange={() => toggleType(x)} aria-label={t("active")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card h-fit">
            <h2 className="h2 mb-4">{lang === "kk" ? "Жаңа қалдық түрі" : "Новый вид отхода"}</h2>
            <label className="label">{t("name")}</label><input className="field mb-2" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} />
            <label className="label">{t("unit")}</label>
            <select className="field mb-2" value={w.unit} onChange={(e) => setW({ ...w, unit: e.target.value })}><option value="kg">{t("kg")}</option><option value="l">{t("l")}</option></select>
            <label className="label">{t("organization")}</label>
            <select className="field mb-2" value={w.org_id} onChange={(e) => setW({ ...w, org_id: e.target.value })}><option value="">{t("all")}</option>{refs.orgs.map((o) => <option key={o.id} value={o.id}>{nm(o, lang)}</option>)}</select>
            <label className="label">{t("disposal")}</label>
            <select className="field mb-3" value={w.disposal} onChange={(e) => setW({ ...w, disposal: e.target.value })}><option value="">—</option>{refs.disposals.map((d) => <option key={d.id} value={d.id}>{nm(d, lang)}</option>)}</select>
            <button type="button" className="btn-primary w-full" onClick={addType}>{t("add")}</button>
          </div>
        </div>
      )}

      {tab === "tools" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <h2 className="h2 mb-2">Telegram · {lang === "kk" ? "еске салулар" : "напоминания о сроках"}</h2>
            <p className="mb-3 text-[14px] text-mute">Ответственным лицам организаций без принятого отчёта за прошлый и текущий месяц уходит сообщение в Telegram.</p>
            <button type="button" className="btn-primary" onClick={sendReminders}>Отправить напоминания</button>
            {remind && <p className="note note-ok mt-3">{remind}</p>}
          </div>
          <div className="card">
            <h2 className="h2 mb-2">API электронных весов</h2>
            <p className="mb-2 text-[14px] text-mute">Весы (Трек 2) отправляют взвешивание напрямую в журнал организации:</p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-wash p-3 font-mono text-[12px] leading-relaxed text-ink">{`POST /api/scale
x-api-key: <ключ весов>
{ "org": "iskander", "waste": "Очистки овощей",
  "weight": 4.2, "device": "scale-01" }`}</pre>
          </div>
        </div>
      )}

      {qr && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-[2px]" onClick={() => setQr(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-[0_20px_60px_rgba(26,31,54,.25)]" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">{t("qr")}</p>
            <h2 className="h2 mb-3">{nm(qr.org, lang)}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.img} alt="QR" className="mx-auto w-full max-w-[280px]" />
            <p className="mt-2 break-all text-[12px] text-mute">{qr.url}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a className="btn-primary" href={qr.img} download={`qr-${qr.org.slug}.png`}>PNG</a>
              <button type="button" className="btn-ghost" onClick={() => setQr(null)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminPage() {
  return <Shell roles={["admin"]}><Admin /></Shell>;
}
