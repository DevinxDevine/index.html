// src/components/auth/RegisterForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RegisterForm() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);

    const redirectUrl = `${window.location.origin}/auth/callback?next=/customer/dashboard`;

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: form.firstName,
          last_name: form.lastName,
          phone: form.phone || undefined,
        },
      },
    });

    setIsLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // The auth/callback route will provision the DB user record on first visit
    router.push("/auth/login?registered=1");
  }

  const fields: { key: keyof typeof form; label: string; type: string; placeholder: string; required: boolean }[] = [
    { key: "firstName",       label: "First name",       type: "text",     placeholder: "Jane",               required: true },
    { key: "lastName",        label: "Last name",        type: "text",     placeholder: "Smith",              required: true },
    { key: "email",           label: "Email address",    type: "email",    placeholder: "jane@example.com",   required: true },
    { key: "phone",           label: "Phone (optional)", type: "tel",      placeholder: "+1 (555) 000-0000",  required: false },
    { key: "password",        label: "Password",         type: "password", placeholder: "Min. 8 characters",  required: true },
    { key: "confirmPassword", label: "Confirm password", type: "password", placeholder: "",                   required: true },
  ];

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {fields.slice(0, 2).map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-medium text-gray-600">{f.label}</label>
              <input
                type={f.type}
                required={f.required}
                value={form[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          ))}
        </div>

        {fields.slice(2).map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-xs font-medium text-gray-600">{f.label}</label>
            <input
              type={f.type}
              required={f.required}
              autoComplete={f.key === "password" ? "new-password" : undefined}
              value={form[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        ))}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <p className="text-xs text-gray-400 leading-relaxed">
          By creating an account you agree to our{" "}
          <a
            href={`/agreement/${process.env.NEXT_PUBLIC_CURRENT_AGREEMENT_VERSION ?? "2024-01-15"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 hover:underline"
          >
            Terms of Service
          </a>
          .
        </p>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          {isLoading ? "Creating account…" : "Create account"}
        </button>
      </div>
    </form>
  );
}
