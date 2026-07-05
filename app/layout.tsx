import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import AuthGate from "@/components/AuthGate";
import CotacoesRefresh from "@/components/CotacoesRefresh";
import TerminalProvider from "@/components/terminal/TerminalProvider";
import TerminalShell from "@/components/terminal/TerminalShell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#08080A",
};

export const metadata: Metadata = {
  title: "Meus Investimentos",
  description: "Dashboard de investimentos pessoal",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Investimentos",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="ambar" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <TerminalProvider>
          <CotacoesRefresh />
          <AuthGate>
            <TerminalShell>{children}</TerminalShell>
          </AuthGate>
        </TerminalProvider>
      </body>
    </html>
  );
}
