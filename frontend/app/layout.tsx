import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const outfit = Outfit({ subsets: ["latin"], weight: ["300", "400", "600", "800"] });

export const metadata: Metadata = {
  title: "Command Center",
  description: "Dashboard de investimentos pessoais",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${outfit.className} bg-[#0a0f1e] text-slate-100 min-h-screen`}>
        <Nav />
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
