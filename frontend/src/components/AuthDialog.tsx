"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

type AuthMode = "signin" | "signup" | "confirm";
type FieldErrors = Partial<
  Record<"fullName" | "email" | "password" | "code", string>
>;

function friendlyAuthError(caught: unknown, mode: AuthMode) {
  const message =
    caught instanceof Error ? caught.message : "Authentication failed.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("name.formatted") ||
    normalized.includes("attribute name") ||
    normalized.includes("schema")
  ) {
    return "Please enter your full name to create your account.";
  }
  if (
    normalized.includes("invalidpassword") ||
    normalized.includes("password did not conform") ||
    normalized.includes("password does not conform")
  ) {
    return "Choose a stronger password with uppercase, lowercase, number, and symbol characters.";
  }
  if (normalized.includes("user already exists") || normalized.includes("usernameexists")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (
    normalized.includes("incorrect username or password") ||
    normalized.includes("notauthorized")
  ) {
    return "The email or password you entered is incorrect.";
  }
  if (normalized.includes("user is not confirmed")) {
    return "Please verify your email before signing in.";
  }
  if (normalized.includes("code mismatch") || normalized.includes("codemismatch")) {
    return "That verification code is incorrect. Please try again.";
  }
  if (normalized.includes("expiredcode") || normalized.includes("expired code")) {
    return "That verification code has expired. Please request a new one.";
  }
  if (normalized.includes("limit exceeded") || normalized.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "We could not reach the sign-in service. Check your connection and try again.";
  }

  return mode === "signup"
    ? "We could not create your account. Please check your details and try again."
    : "We could not sign you in. Please check your details and try again.";
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.3A10.7 10.7 0 0112 4c5.5 0 9 5.5 9 8a10.8 10.8 0 01-2.2 3.5M6.5 6.5C4.2 8 3 10.4 3 12c0 2.5 3.5 8 9 8a9.7 9.7 0 004.1-.9" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 12c0-2.5 3.5-8 9-8s9 5.5 9 8-3.5 8-9 8-9-5.5-9-8z" />
      <circle cx="12" cy="12" r="2.5" strokeWidth="1.8" />
    </svg>
  );
}

export function AuthDialog({
  open,
  onClose,
  initialMode = "signin",
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: "signin" | "signup";
  onAuthenticated?: () => void;
}) {
  const { login, register, confirm, configured, missingConfig } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function switchMode(nextMode: "signin" | "signup") {
    setMode(nextMode);
    setError("");
    setFieldErrors({});
  }

  function validate() {
    const nextErrors: FieldErrors = {};
    const cleanEmail = email.trim();

    if (mode === "signup" && !fullName.trim()) {
      nextErrors.fullName = "Enter your full name.";
    }
    if (!cleanEmail) {
      nextErrors.email = "Enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (mode !== "confirm" && !password) {
      nextErrors.password = "Enter your password.";
    } else if (mode === "signup" && password.length < 8) {
      nextErrors.password = "Use at least 8 characters for your password.";
    }
    if (mode === "confirm" && !code.trim()) {
      nextErrors.code = "Enter the verification code from your email.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validate()) return;

    setBusy(true);
    setError("");

    try {
      if (mode === "signin") {
        await login(email.trim(), password);
        onAuthenticated?.();
      } else if (mode === "signup") {
        const complete = await register(fullName.trim(), email.trim(), password);
        if (complete) onAuthenticated?.();
        else {
          setMode("confirm");
          setFieldErrors({});
        }
      } else {
        await confirm(email.trim(), code.trim());
        await login(email.trim(), password);
        onAuthenticated?.();
      }
    } catch (caught) {
      setError(friendlyAuthError(caught, mode));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Create your account"
        : "Verify your email";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500" />
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xl font-black text-slate-950">{title}</p>
              <p className="mt-1 text-sm text-slate-500">
                Your cart, orders, and delivery preferences stay private to
                your account.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {!configured ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-black text-amber-950">
                {process.env.NODE_ENV === "development"
                  ? "Authentication setup required"
                  : "Sign-in is temporarily unavailable"}
              </p>
              {process.env.NODE_ENV === "development" ? (
                <>
                  <p className="mt-1 text-sm text-amber-900">
                    Add these variables to{" "}
                    <code className="font-bold">frontend/.env.local</code>, then
                    restart Next.js:
                  </p>
                  <ul className="mt-3 space-y-1 rounded-lg bg-white/70 p-3 font-mono text-xs text-amber-950">
                    {missingConfig.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-sm text-amber-900">
                  Please try again shortly. You can continue browsing products
                  in the meantime.
                </p>
              )}
            </div>
          ) : (
            <>
              {mode !== "confirm" ? (
                <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  {(["signin", "signup"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => switchMode(tab)}
                      className={`rounded-lg px-3 py-2 text-sm font-black transition ${
                        mode === tab
                          ? "bg-white text-slate-950 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {tab === "signin" ? "Login" : "Sign up"}
                    </button>
                  ))}
                </div>
              ) : null}

              <form onSubmit={submit} noValidate className="space-y-4">
                {mode === "signup" ? (
                  <label className="block text-sm font-bold text-slate-700">
                    Full name
                    <input
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => {
                        setFullName(event.target.value);
                        setFieldErrors((current) => ({
                          ...current,
                          fullName: undefined,
                        }));
                      }}
                      aria-invalid={Boolean(fieldErrors.fullName)}
                      className={`mt-1 w-full rounded-lg border px-3 py-2.5 outline-none transition focus:border-amber-500 ${
                        fieldErrors.fullName
                          ? "border-red-400"
                          : "border-slate-300"
                      }`}
                    />
                    {fieldErrors.fullName ? (
                      <span className="mt-1 block text-xs font-semibold text-red-600">
                        {fieldErrors.fullName}
                      </span>
                    ) : null}
                  </label>
                ) : null}

                <label className="block text-sm font-bold text-slate-700">
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setFieldErrors((current) => ({
                        ...current,
                        email: undefined,
                      }));
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    className={`mt-1 w-full rounded-lg border px-3 py-2.5 outline-none transition focus:border-amber-500 ${
                      fieldErrors.email ? "border-red-400" : "border-slate-300"
                    }`}
                  />
                  {fieldErrors.email ? (
                    <span className="mt-1 block text-xs font-semibold text-red-600">
                      {fieldErrors.email}
                    </span>
                  ) : null}
                </label>

                {mode !== "confirm" ? (
                  <label className="block text-sm font-bold text-slate-700">
                    Password
                    <span className="relative mt-1 block">
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          mode === "signin"
                            ? "current-password"
                            : "new-password"
                        }
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setFieldErrors((current) => ({
                            ...current,
                            password: undefined,
                          }));
                        }}
                        aria-invalid={Boolean(fieldErrors.password)}
                        className={`w-full rounded-lg border px-3 py-2.5 pr-11 outline-none transition focus:border-amber-500 ${
                          fieldErrors.password
                            ? "border-red-400"
                            : "border-slate-300"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-slate-700"
                      >
                        <EyeIcon hidden={showPassword} />
                      </button>
                    </span>
                    {fieldErrors.password ? (
                      <span className="mt-1 block text-xs font-semibold text-red-600">
                        {fieldErrors.password}
                      </span>
                    ) : null}
                  </label>
                ) : (
                  <label className="block text-sm font-bold text-slate-700">
                    Confirmation code
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => {
                        setCode(event.target.value);
                        setFieldErrors((current) => ({
                          ...current,
                          code: undefined,
                        }));
                      }}
                      aria-invalid={Boolean(fieldErrors.code)}
                      className={`mt-1 w-full rounded-lg border px-3 py-2.5 outline-none transition focus:border-amber-500 ${
                        fieldErrors.code ? "border-red-400" : "border-slate-300"
                      }`}
                    />
                    {fieldErrors.code ? (
                      <span className="mt-1 block text-xs font-semibold text-red-600">
                        {fieldErrors.code}
                      </span>
                    ) : null}
                  </label>
                )}

                {error ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                  >
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-amber-400 px-4 py-2.5 font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy
                    ? "Please wait…"
                    : mode === "signin"
                      ? "Sign in"
                      : mode === "signup"
                        ? "Create account"
                        : "Verify email"}
                </button>

                {mode === "signin" ? (
                  <p className="text-center text-sm text-slate-500">
                    New to InstaKart?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signup")}
                      className="font-black text-slate-800 hover:text-amber-700"
                    >
                      Create an account
                    </button>
                  </p>
                ) : mode === "signup" ? (
                  <p className="text-center text-sm text-slate-500">
                    Already an existing customer?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signin")}
                      className="font-black text-slate-800 hover:text-amber-700"
                    >
                      Sign in
                    </button>
                  </p>
                ) : null}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
