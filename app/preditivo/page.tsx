"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PreditivoRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/performance"); }, [router]);
  return null;
}
