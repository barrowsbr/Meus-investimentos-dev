"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SetoresRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/resumo");
  }, [router]);
  return null;
}
