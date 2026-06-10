import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import AuthGate from "@/components/AuthGate";
import AppBackground from "@/components/AppBackground";
import CotacoesRefresh from "@/components/CotacoesRefresh";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0E1016",
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
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.className} antialiased`}>
        {/* Ambient glow overlays */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
          {/* Teal glow — top right */}
          <div
            className="absolute animate-ambient"
            style={{
              top: "-160px",
              right: "-160px",
              width: "600px",
              height: "520px",
              background: "radial-gradient(ellipse, rgba(20,184,166,0.07) 0%, transparent 68%)",
              filter: "blur(2px)",
            }}
          />
          {/* Amber glow — bottom left */}
          <div
            className="absolute animate-ambient"
            style={{
              bottom: "-140px",
              left: "-100px",
              width: "520px",
              height: "420px",
              background: "radial-gradient(ellipse, rgba(180,120,40,0.055) 0%, transparent 65%)",
              filter: "blur(2px)",
              animationDelay: "3s",
            }}
          />
        </div>

        <AppBackground />
        <CotacoesRefresh />
        <AuthGate>
          <Sidebar />
          <main className="relative z-10 md:ml-56 min-h-screen px-4 pt-[max(0.9rem,calc(0.9rem+env(safe-area-inset-top)))] pb-20 md:px-8 md:pt-8 md:pb-8">
            {children}
          </main>
        </AuthGate>
      </body>
    </html>
  );
}
