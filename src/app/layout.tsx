import type { Metadata, Viewport } from "next";
import { Golos_Text, Inter, JetBrains_Mono, Onest } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

// Три гротеска с полной кириллицей и казахскими буквами; выбор — переключателем в боковом меню
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const golos = Golos_Text({ variable: "--font-golos", subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const onest = Onest({ variable: "--font-onest", subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "ZeroWaste ATU — учёт пищевых отходов",
  description: "Цифровая система управления пищевыми отходами университетского комплекса АТУ",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${golos.variable} ${onest.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
