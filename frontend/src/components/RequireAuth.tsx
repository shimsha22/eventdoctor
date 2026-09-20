"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, usingCognito } from "@/lib/auth";

/**
 * In demo mode, automatically sign in as SRE so the console opens immediately.
 * If Cognito is configured, keep the current login gate.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready, signInAs } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;

    if (!user) {
      if (usingCognito()) {
        router.replace("/login");
        return;
      }

      signInAs("SRE");
      return;
    }
  }, [ready, user, router, signInAs]);

  if (!ready) return null;
  if (!user) return null;
  return <>{children}</>;
}
