"use client";
import { useEffect, type ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { ConfirmProvider } from "@/components/Confirm";

export function Providers({ children }: { children: ReactNode }) {
  // сохранённый вид: акцент и шрифт (переключатель в боковом меню)
  useEffect(() => {
    try {
      const a = localStorage.getItem("zw-accent"), f = localStorage.getItem("zw-font");
      if (a) document.documentElement.dataset.accent = a;
      if (f) document.documentElement.dataset.font = f;
    } catch {}
  }, []);
  return (
    <I18nProvider>
      <AuthProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
