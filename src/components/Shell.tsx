"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n, nm, type Key } from "@/lib/i18n";
import type { Role } from "@/lib/supabase";

const NAV: { href: string; key: Key; roles: Role[]; icon: string }[] = [
  { href: "/entry", key: "navEntry", roles: ["responsible"], icon: "M12 5v14M5 12h14" },
  { href: "/reports", key: "navReports", roles: ["responsible", "reviewer", "admin", "management"], icon: "M6 3h9l4 4v14H6zM9 12h7M9 16h7" },
  { href: "/registry", key: "navRegistry", roles: ["reviewer", "admin", "management"], icon: "M4 6h16M4 12h16M4 18h16" },
  { href: "/summary", key: "navSummary", roles: ["reviewer", "admin", "management"], icon: "M5 20V10M12 20V4M19 20v-7" },
  { href: "/dashboard", key: "navDashboard", roles: ["responsible", "reviewer", "admin", "management"], icon: "M4 19l5-6 4 3 7-9" },
  { href: "/admin", key: "navAdmin", roles: ["admin"], icon: "M12 8a4 4 0 100 8 4 4 0 000-8zM3 12h2M19 12h2M12 3v2M12 19v2" },
];

export function LangSwitch({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`inline-flex rounded-full p-0.5 text-[12px] font-bold ${dark ? "bg-white/10" : "bg-mint"}`} role="group" aria-label="Тіл / Язык">
      {(["kk", "ru"] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`rounded-full px-2.5 py-1 ${lang === l ? "bg-white text-pine" : dark ? "text-white/70" : "text-mute"}`}>
          {l === "kk" ? "ҚАЗ" : "РУС"}
        </button>
      ))}
    </div>
  );
}

export function Shell({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { loading, profile, org, signOut } = useAuth();
  const { t, lang } = useI18n();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!profile) router.replace("/login?next=" + encodeURIComponent(path + window.location.search));
    else if (roles && !roles.includes(profile.role)) router.replace("/");
  }, [loading, profile, roles, router, path]);

  if (loading || !profile || (roles && !roles.includes(profile.role)))
    return <div className="grid min-h-dvh place-items-center text-mute">{t("loading")}</div>;

  const items = NAV.filter((n) => n.roles.includes(profile.role));
  const who = t(("role_" + profile.role) as Key) + (org ? " · " + nm(org, lang) : "");
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-30 bg-pine text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="hidden sm:inline">ZeroWaste ATU</span>
          </Link>
          <nav className="ml-4 hidden gap-1 md:flex">
            {items.map((n) => (
              <Link key={n.href} href={n.href}
                className={`rounded-lg px-3 py-1.5 text-[14px] font-medium ${path.startsWith(n.href) ? "bg-white/15" : "text-white/75 hover:text-white"}`}>
                {t(n.key)}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right leading-tight lg:block">
              <div className="text-[13px] font-semibold">{profile.full_name}</div>
              <div className="text-[11px] text-white/60">{who}</div>
            </div>
            <LangSwitch dark />
            <button type="button" onClick={signOut} className="rounded-lg border border-white/20 px-2.5 py-1.5 text-[12px] font-semibold hover:bg-white/10">{t("logout")}</button>
          </div>
        </div>
        <div className="truncate border-t border-white/10 px-4 py-1 text-[11px] text-white/70 lg:hidden">
          {profile.full_name} · {who}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-paper md:hidden">
        {items.slice(0, 5).map((n) => {
          const on = path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${on ? "text-leaf" : "text-mute"}`}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
              {t(n.key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const cls: Record<string, string> = {
    draft: "bg-line/60 text-ink",
    submitted: "bg-amber/20 text-[#8a5a00]",
    in_review: "bg-[#dbe9ff] text-[#1d4f9c]",
    accepted: "bg-mint text-leaf",
    returned: "bg-clay/15 text-clay",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-bold ${cls[status] ?? ""}`}>{t(("st_" + status) as Key)}</span>;
}
