"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, usingCognito } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui";

const ROLES: { role: Role; can: string }[] = [
  { role: "Admin", can: "review fixes and approve deploys" },
  { role: "SRE", can: "review fixes and approve deploys" },
  { role: "Developer", can: "review fixes, but not deploy" },
  { role: "Viewer", can: "read incidents only" },
];

export default function LoginPage() {
  const { signIn, signInAs } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      router.push("/incidents");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-[420px] mx-auto px-5 py-20">
      <Link href="/" className="font-bold text-[17px] tracking-tight">
        EventDoctor
      </Link>

      <h1 className="text-[26px] font-bold tracking-tight mt-10 mb-1">Sign in</h1>
      <p className="text-ink-3 text-sm mb-7">
        Your role decides what you can approve.
      </p>

      {usingCognito() && (
        <div className="bg-card border border-line rounded-lg p-5 mb-6">
          <label className="block text-sm font-medium mb-1.5">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="w-full border border-line rounded-md px-3 py-2 text-sm bg-card mb-4"
          />
          <label className="block text-sm font-medium mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-full border border-line rounded-md px-3 py-2 text-sm bg-card mb-4"
          />
          <Button
            variant="primary"
            disabled={busy || !username || !password}
            onClick={submit}
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          {error && (
            <p className="text-cause text-[13px] mt-3 m-0">{error}</p>
          )}
        </div>
      )}

      <div className="bg-card border border-line rounded-lg p-5">
        <h2 className="text-sm font-semibold m-0 mb-1">
          {usingCognito() ? "Or pick a role for the demo" : "Pick a role"}
        </h2>
        <p className="text-[13px] text-ink-3 m-0 mb-4">
          {usingCognito()
            ? "Skips Cognito. Useful when you want to show what a Viewer can't do."
            : "Cognito isn't configured yet, so sign in with a role directly."}
        </p>
        <div className="grid gap-2">
          {ROLES.map((r) => (
            <button
              key={r.role}
              onClick={() => {
                signInAs(r.role);
                router.push("/incidents");
              }}
              className="text-left border border-line rounded-md px-3 py-2.5 hover:border-ink-3 transition-colors"
            >
              <span className="font-semibold text-sm">{r.role}</span>
              <span className="block text-[12.5px] text-ink-3">Can {r.can}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
