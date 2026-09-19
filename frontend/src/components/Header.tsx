"use client";

import Link from "next/link";
import type { Role } from "@/lib/types";
import { isMockMode } from "@/lib/api";
import { useAuth, usingCognito } from "@/lib/auth";

const ROLES: Role[] = ["Admin", "SRE", "Developer", "Viewer"];

export default function Header() {
  const { user, setRole, signOut } = useAuth();

  return (
    <header className="bg-card border-b border-line sticky top-0 z-20">
      <div className="max-w-[1180px] mx-auto px-5 py-3 flex items-center gap-4 flex-wrap">
        <Link href="/incidents" className="font-bold text-[17px] tracking-tight">
          EventDoctor{" "}
          <span className="text-ink-3 font-normal">/ incident console</span>
        </Link>
        <div className="flex-1" />

        {isMockMode() && (
          <span className="font-mono text-[11.5px] px-2 py-1 rounded bg-symptom-soft text-symptom">
            demo data
          </span>
        )}

        {user && (
          <>
            <label className="text-[13px] text-ink-3 flex items-center gap-2">
              <span className="hidden sm:inline">{user.username}</span>
              <select
                value={user.role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="font-mono text-[12px] bg-signal-soft text-signal rounded px-2 py-1"
                title={
                  usingCognito()
                    ? "Switches role locally. The backend still checks your real Cognito group."
                    : "Switches role"
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={signOut}
              className="text-[13px] text-ink-3 hover:text-ink"
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
