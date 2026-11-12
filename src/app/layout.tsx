import type { Metadata, Viewport } from "next";
import { Golos_Text, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const golos = Golos_Text({ variable: "--font-golos", subsets: ["latin", "cyrillic", "cyrillic-ext"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "ZeroWaste ATU — учёт пищевых отходов",
  description: "Цифровая система управления пищевыми отходами университетского комплекса АТУ",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#0f3a28", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
