"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BarChart3, ClipboardList, FileSpreadsheet, LogOut, PenLine, Settings2, Table2, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n, nm, type Key } from "@/lib/i18n";
import type { Role } from "@/lib/supabase";

const NAV: { href: string; key: Key; roles: Role[]; icon: LucideIcon }[] = [
  { href: "/entry", key: "navEntry", roles: ["responsible"], icon: PenLine },
  { href: "/reports", key: "navReports", roles: ["responsible", "reviewer", "admin", "management"], icon: ClipboardList },
  { href: "/registry", key: "navRegistry", roles: ["reviewer", "admin", "management"], icon: Table2 },
  { href: "/summary", key: "navSummary", roles: ["reviewer", "admin", "management"], icon: FileSpreadsheet },
  { href: "/dashboard", key: "navDashboard", roles: ["responsible", "reviewer", "admin", "management"], icon: BarChart3 },
  { href: "/admin", key: "navAdmin", roles: ["admin"], icon: Settings2 },
];

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#16192c" />
      <path d="M22.5 16a6.5 6.5 0 1 1-2.2-4.9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M17.6 9.6l3 1.4-1.3 3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="seg !text-[12px]" role="group" aria-label="Тіл / Язык">
      {(["kk", "ru"] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={`${lang === l ? "seg-on" : "seg-off"} !px-2 !py-1`}>
          {l === "kk" ? "Қаз" : "Рус"}
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
    return <div className="grid min-h-dvh place-items-center text-[14px] text-mute">{t("loading")}</div>;

  const items = NAV.filter((n) => n.roles.includes(profile.role));
  const initials = profile.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const isOn = (href: string) => path.startsWith(href) || (href === "/entry" && path.startsWith("/import"));

  return (
    <div className="min-h-dvh md:pl-60">
      {/* боковое меню — ноутбук */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-paper md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <Logo />
          <span className="leading-tight">
            <span className="block text-[14px] font-semibold tracking-[-0.01em]">ZeroWaste ATU</span>
            <span className="block text-[12px] text-mute">{lang === "kk" ? "Қалдықтарды есепке алу" : "Учёт пищевых отходов"}</span>
          </span>
        </Link>
        {org && (
          <div className="mx-3 mb-2 rounded-lg border border-line px-3 py-2">
            <div className="text-[12px] font-semibold text-mute">{t("organization")}</div>
            <div className="text-[14px] font-semibold leading-snug">{nm(org, lang)}</div>
          </div>
        )}
        <nav className="flex flex-col gap-0.5 px-3 py-2">
          {items.map((n) => {
            const on = isOn(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors ${on ? "bg-wash font-semibold text-ink" : "font-normal text-mute hover:bg-wash hover:text-ink"}`}>
                <n.icon className={`h-[17px] w-[17px] ${on ? "text-ink" : "text-faint"}`} strokeWidth={on ? 2.2 : 1.8} />
                {t(n.key)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-line p-3">
          <div className="flex items-center gap-2.5 px-1.5 pb-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-wash text-[12px] font-semibold text-ink">{initials}</span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[14px] font-semibold">{profile.full_name}</span>
              <span className="block truncate text-[12px] text-mute">{t(("role_" + profile.role) as Key)}</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <LangSwitch />
            <button type="button" onClick={signOut} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[14px] font-semibold text-mute hover:bg-wash hover:text-ink">
              <LogOut className="h-4 w-4" strokeWidth={1.9} />{t("logout")}
            </button>
          </div>
        </div>
      </aside>

      {/* шапка — телефон */}
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-paper px-4 py-2.5 md:hidden">
        <Logo size={30} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[14px] font-semibold">{org ? nm(org, lang) : "ZeroWaste ATU"}</span>
          <span className="block truncate text-[12px] text-mute">{profile.full_name} · {t(("role_" + profile.role) as Key)}</span>
        </span>
        <LangSwitch />
        <button type="button" onClick={signOut} aria-label={t("logout")} className="grid h-9 w-9 place-items-center rounded-lg text-mute hover:bg-wash"><LogOut className="h-[18px] w-[18px]" strokeWidth={1.9} /></button>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 pt-6 pb-28 md:px-7 md:pt-8 md:pb-16">{children}</main>

      {/* нижнее меню — телефон */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.slice(0, 5).map((n) => {
          const on = isOn(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[12px] font-semibold ${on ? "font-semibold text-ink" : "text-faint"}`}>
              <n.icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.2 : 1.8} />
              <span className="max-w-full truncate px-1">{t(n.key)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

const ST: Record<string, [string, string]> = {
  draft: ["bg-[#f0f2f5] text-[#545969]", "bg-[#8792a2]"],
  submitted: ["bg-[#fdf3dc] text-[#8a5a00]", "bg-[#d99a12]"],
  in_review: ["bg-[#e6eefc] text-[#2a55a8]", "bg-sky"],
  accepted: ["bg-mint text-leafdark", "bg-leaf"],
  returned: ["bg-[#fdeaf0] text-[#a8284c]", "bg-clay"],
};
export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const [box, dot] = ST[status] ?? ST.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-[3px] text-[12px] font-semibold ${box}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{t(("st_" + status) as Key)}
    </span>
  );
}

/** Заголовок страницы: название, пояснение и действия справа */
export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="h1">{title}</h1>
        {sub && <p className="mt-1 text-[14px] leading-5 text-mute">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
