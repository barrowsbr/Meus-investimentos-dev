import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite que o frontend consuma a API do Cloud Run sem bloqueio de CORS no SSR
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            source: "/api/:path*",
            destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/:path*`,
          },
        ]
      : [];
  },
};

export default nextConfig;
