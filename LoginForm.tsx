// src/components/auth/LoginForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface LoginFormProps {
  redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(redirectTo ?? "/customer/dashboard");
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo ?? "/customer/dashboard")}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl },
    });

    setIsLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setMagicSent(true);
    }
  }

  if (magicSent) {
    return (
      <div className="text-center">
        <div className="mb-3 text-3xl">📬</div>
        <p className="font-semibold text-gray-800">Check your email</p>
        <p className="mt-2 text-sm text-gray-500">
          We sent a magic link to <strong>{email}</strong>. Click it to sign in.
        </p>
        <button
          type="button"
          onClick={() => setMagicSent(false)}
          className="mt-4 text-xs text-teal-600 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="mb-6 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        {(["password", "magic"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); }}
            className={cn(
              "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
              mode === m
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {m === "password" ? "Password" : "Magic link"}
          </button>
        ))}
      </div>

      <form onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Email address
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {mode === "password" && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600">Password</label>
                <button
                  type="button"
                  onClick={() => setMode("magic")}
                  className="text-xs text-teal-600 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {isLoading
              ? "Please wait…"
              : mode === "password"
              ? "Sign in"
              : "Send magic link"}
          </button>
        </div>
      </form>
    </div>
  );
}
