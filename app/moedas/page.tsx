"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MoedasRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/bolsas?tab=moedas");
  }, [router]);
  return null;
}
