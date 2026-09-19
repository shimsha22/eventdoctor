"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Role } from "./types";

/**
 * Two ways to sign in, chosen automatically:
 *
 *  - Cognito, if NEXT_PUBLIC_COGNITO_USER_POOL_ID is set.
 *  - A local role picker, if it isn't.
 *
 * The rest of the app only ever reads `user.role` and `user.token`, so it
 * behaves identically either way. That means the demo never depends on the
 * user pool existing.
 */

const POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "";
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";

export const usingCognito = () => Boolean(POOL_ID && CLIENT_ID);

export interface AuthUser {
  username: string;
  role: Role;
  token: string;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signInAs: (role: Role) => void;
  signOut: () => void;
  setRole: (role: Role) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "ed_user";

/** Cognito puts group membership in the token. Map the first known group to a role. */
function roleFromGroups(groups: string[]): Role {
  const order: Role[] = ["Admin", "SRE", "Developer", "Viewer"];
  return order.find((r) => groups.includes(r)) ?? "Viewer";
}

function decodeGroups(idToken: string): string[] {
  try {
    const payload = JSON.parse(atob(idToken.split(".")[1]));
    return payload["cognito:groups"] ?? [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // restore a previous session
  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: AuthUser = JSON.parse(raw);
        setUser(parsed);
        window.localStorage.setItem("ed_token", parsed.token);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setReady(true);
  }, []);

  const persist = useCallback((u: AuthUser | null) => {
    setUser(u);
    if (u) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      window.localStorage.setItem("ed_token", u.token);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem("ed_token");
    }
  }, []);

  const signIn = useCallback(
    async (username: string, password: string) => {
      if (!usingCognito()) {
        throw new Error("Cognito isn't configured. Use the role picker below.");
      }
      // imported lazily so the app still builds and runs without Cognito set up
      const { Amplify } = await import("aws-amplify");
      const auth = await import("aws-amplify/auth");

      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: POOL_ID,
            userPoolClientId: CLIENT_ID,
          },
        },
      });

      try {
        await auth.signOut();
      } catch {
        // no existing session, which is fine
      }

      await auth.signIn({ username, password });
      const session = await auth.fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error("Signed in, but no token came back.");

      persist({
        username,
        role: roleFromGroups(decodeGroups(idToken)),
        token: idToken,
      });
    },
    [persist],
  );

  const signInAs = useCallback(
    (role: Role) => {
      persist({
        username: role.toLowerCase() + "@demo",
        role,
        token: "demo-token",
      });
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    if (usingCognito()) {
      try {
        const auth = await import("aws-amplify/auth");
        await auth.signOut();
      } catch {
        // ignore — clearing local state is what matters
      }
    }
    persist(null);
  }, [persist]);

  /** Switching role without signing out again. Demo convenience only. */
  const setRole = useCallback(
    (role: Role) => {
      if (user) persist({ ...user, role });
    },
    [user, persist],
  );

  const value = useMemo(
    () => ({ user, ready, signIn, signInAs, signOut, setRole }),
    [user, ready, signIn, signInAs, signOut, setRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
