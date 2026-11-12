"use client";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { useI18n, nm, dateRu } from "@/lib/i18n";
import { fmt, today, type Disposal, type Entry, type Org, type Profile, type WasteType, supabase } from "@/lib/supabase";
import { loadRefs, loadRegistry } from "@/lib/data";

function Registry() {
  const { t, lang } = useI18n();
  const [from, setFrom] = useState(today().slice(0, 4) + "-07-01");
  const [to, setTo] = useState(today());
  const [orgId, setOrgId] = useState("");
  const [typeName, setTypeName] = useState("");
  const [dispId, setDispId] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [refs, setRefs] = useState<{ orgs: Org[]; types: WasteType[]; disposals: Disposal[] }>({ orgs: [], types: [], disposals: [] });
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(200);

  useEffect(() => {
    (async () => {
      const [rf, pp] = await Promise.all([loadRefs(), supabase.from("profiles").select("*")]);
      setRefs(rf);
      setPeople(Object.fromEntries(((pp.data ?? []) as Profile[]).map((p) => [p.id, p])));
    })();
  }, []);
  useEffect(() => {
    setLoading(true);
    loadRegistry(from, to).then((r) => { setEntries(r.entries); setLoading(false); });
  }, [from, to]);

  const typeById = useMemo(() => Object.fromEntries(refs.types.map((x) => [x.id, x])), [refs.types]);
  const orgById = useMemo(() => Object.fromEntries(refs.orgs.map((x) => [x.id, x])), [refs.orgs]);
  const dispById = useMemo(() => Object.fromEntries(refs.disposals.map((x) => [x.id, x])), [refs.disposals]);
  // виды отходов объединяем по названию (у разных организаций совпадают)
  const typeNames = useMemo(() => {
    const src = orgId ? refs.types.filter((x) => x.org_id === orgId) : refs.types;
    return [...new Set(src.map((x) => x.name_ru))].sort();
  }, [refs.types, orgId]);

  const rows = entries.filter((e) =>
    (!orgId || e.org_id === orgId) && (!typeName || typeById[e.waste_type_id]?.name_ru === typeName) && (!dispId || e.disposal_id === dispId));
  let kg = 0, l = 0;
  for (const e of rows) { if (typeById[e.waste_type_id]?.unit === "l") l += Number(e.quantity); else kg += Number(e.quantity); }

  return (
    <>
      <h1 className="h1 mb-4">{t("registryTitle")}</h1>
      <div className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div><label className="label" htmlFor="f">{t("from")}</label><input id="f" type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label" htmlFor="tt">{t("to")}</label><input id="tt" type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><label className="label" htmlFor="o">{t("organization")}</label>
          <select id="o" className="field" value={orgId} onChange={(e) => { setOrgId(e.target.value); setTypeName(""); }}>
            <option value="">{t("all")}</option>{refs.orgs.map((o) => <option key={o.id} value={o.id}>{nm(o, lang)}</option>)}
          </select></div>
        <div><label className="label" htmlFor="w">{t("wasteType")}</label>
          <select id="w" className="field" value={typeName} onChange={(e) => setTypeName(e.target.value)}>
            <option value="">{t("all")}</option>{typeNames.map((n) => <option key={n} value={n}>{nm(refs.types.find((x) => x.name_ru === n), lang)}</option>)}
          </select></div>
        <div className="col-span-2 md:col-span-1"><label className="label" htmlFor="dd">{t("disposal")}</label>
          <select id="dd" className="field" value={dispId} onChange={(e) => setDispId(e.target.value)}>
            <option value="">{t("all")}</option>{refs.disposals.map((d) => <option key={d.id} value={d.id}>{nm(d, lang)}</option>)}
          </select></div>
      </div>
      <p className="mb-3 text-[15px]">
        <b className="num">{rows.length}</b> {t("entriesCount")} · {t("total")}: <b className="num">{fmt(kg)} {t("kg")}</b>{l > 0 && <> · <b className="num">{fmt(l)} {t("l")}</b></>}
      </p>
      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-line bg-cream/60"><tr>
            <th className="th">{t("date")}</th><th className="th">{t("organization")}</th><th className="th">{t("wasteType")}</th>
            <th className="th text-right">{t("quantity")}</th><th className="th">{t("disposal")}</th><th className="th">{t("responsible")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line/70">
            {loading ? <tr><td className="td text-mute" colSpan={6}>{t("loading")}</td></tr> :
              rows.length === 0 ? <tr><td className="td text-mute" colSpan={6}>{t("noEntries")}</td></tr> :
              rows.slice(0, limit).map((e) => (
                <tr key={e.id}>
                  <td className="td num whitespace-nowrap">{dateRu(e.entry_date)}</td>
                  <td className="td">{nm(orgById[e.org_id], lang)}</td>
                  <td className="td">{nm(typeById[e.waste_type_id], lang)}</td>
                  <td className="td num text-right font-semibold whitespace-nowrap">{fmt(Number(e.quantity))} {t(typeById[e.waste_type_id]?.unit ?? "kg")}</td>
                  <td className="td text-mute">{nm(dispById[e.disposal_id ?? ""], lang)}</td>
                  <td className="td text-mute">{people[e.responsible_id ?? ""]?.full_name ?? "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setLimit(limit + 500)}>+ {Math.min(500, rows.length - limit)}</button>}
    </>
  );
}

export default function RegistryPage() {
  return <Shell roles={["reviewer", "admin", "management"]}><Registry /></Shell>;
}
