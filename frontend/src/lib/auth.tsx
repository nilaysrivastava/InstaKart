"use client";

import { Amplify } from "aws-amplify";
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID;
const missingConfig = [
  !userPoolId ? "NEXT_PUBLIC_COGNITO_USER_POOL_ID" : null,
  !userPoolClientId ? "NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID" : null,
].filter((value): value is string => Boolean(value));

if (userPoolId && userPoolClientId) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: { email: true },
      },
    },
  });
}

export type AuthUser = {
  userId: string;
  username: string;
  email: string;
  groups: string[];
  isAdmin: boolean;
};

export function hasAdminGroup(groupsClaim: unknown) {
  if (Array.isArray(groupsClaim)) {
    return groupsClaim.map(String).includes("admin");
  }
  if (typeof groupsClaim === "string") {
    return groupsClaim
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((group) => group.trim().replace(/^"|"$/g, ""))
      .includes("admin");
  }
  return false;
}

function readGroups(groupsClaim: unknown) {
  if (Array.isArray(groupsClaim)) return groupsClaim.map(String);
  if (typeof groupsClaim === "string") {
    return groupsClaim
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((group) => group.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  return [];
}

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  configured: boolean;
  missingConfig: string[];
  login: (email: string, password: string) => Promise<void>;
  register: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<boolean>;
  confirm: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readCurrentUser(): Promise<AuthUser | null> {
  try {
    const [currentUser, session] = await Promise.all([
      getCurrentUser(),
      fetchAuthSession(),
    ]);
    const claims = session.tokens?.idToken?.payload;
    const accessClaims = session.tokens?.accessToken?.payload;
    const groupsClaim =
      accessClaims?.["cognito:groups"] || claims?.["cognito:groups"];
    const groups = readGroups(groupsClaim);

    return {
      userId: currentUser.userId,
      username: currentUser.username,
      email: String(claims?.email || currentUser.username),
      groups,
      isAdmin: hasAdminGroup(groups),
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = Boolean(userPoolId && userPoolClientId);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const currentUser = configured ? await readCurrentUser() : null;
    setUser(currentUser);
    setLoading(false);
  }, [configured]);

  useEffect(() => {
    let cancelled = false;
    const currentUser = configured ? readCurrentUser() : Promise.resolve(null);
    currentUser.then((result) => {
      if (cancelled) return;
      setUser(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured,
      missingConfig,
      login: async (email, password) => {
        const result = await signIn({ username: email, password });
        if (!result.isSignedIn) {
          throw new Error("Additional sign-in confirmation is required.");
        }
        await refreshUser();
      },
      register: async (fullName, email, password) => {
        const result = await signUp({
          username: email,
          password,
          options: {
            userAttributes: {
              email,
              name: fullName.trim(),
            },
          },
        });
        if (result.isSignUpComplete) await refreshUser();
        return result.isSignUpComplete;
      },
      confirm: async (email, code) => {
        const result = await confirmSignUp({
          username: email,
          confirmationCode: code,
        });
        if (!result.isSignUpComplete) {
          throw new Error("Account confirmation is not complete.");
        }
      },
      logout: async () => {
        await signOut();
        setUser(null);
      },
    }),
    [configured, loading, refreshUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

export async function getAccessToken() {
  const session = await fetchAuthSession();
  return session.tokens?.accessToken?.toString() || null;
}
