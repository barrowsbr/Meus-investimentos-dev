"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NoticiasRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/bolsas?tab=inteligencia");
  }, [router]);
  return null;
}
