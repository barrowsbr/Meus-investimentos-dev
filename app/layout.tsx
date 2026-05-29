import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import AuthGate from "@/components/AuthGate";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0D0E11",
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
    icon: "/icon-192.png",
    apple: "/icon-192.png",
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
              top: "-180px",
              right: "-180px",
              width: "560px",
              height: "480px",
              background: "radial-gradient(ellipse, rgba(20,184,166,0.055) 0%, transparent 68%)",
              filter: "blur(2px)",
            }}
          />
          {/* Amber glow — bottom left */}
          <div
            className="absolute animate-ambient"
            style={{
              bottom: "-160px",
              left: "-120px",
              width: "480px",
              height: "380px",
              background: "radial-gradient(ellipse, rgba(180,120,40,0.04) 0%, transparent 65%)",
              filter: "blur(2px)",
              animationDelay: "3s",
            }}
          />
        </div>

        <AuthGate>
          <Sidebar />
          <main className="relative z-10 md:ml-56 min-h-screen px-4 py-6 md:px-8 md:py-8 pb-20 md:pb-8">
            {children}
          </main>
        </AuthGate>
      </body>
    </html>
  );
}
