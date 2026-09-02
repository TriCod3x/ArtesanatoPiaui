"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Revalida a rota (Server Component) sempre que a aba volta ao foco. */
export function FocusRefresher() {
  const router = useRouter();

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "hidden") router.refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [router]);

  return null;
}
