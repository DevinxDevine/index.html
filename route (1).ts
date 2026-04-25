// src/app/auth/callback/route.ts
// Handles Supabase auth callbacks: email magic links, OAuth, email confirmation.
// After exchange, provisions a DB user record if one doesn't exist yet.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/customer/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
  }

  const supabase = createServerClient();

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("[auth/callback]", error);
    return NextResponse.redirect(`${origin}/auth/login?error=exchange_failed`);
  }

  const supabaseUser = data.user;

  // Provision DB user record on first login
  const existingUser = await prisma.user.findUnique({
    where: { supabaseId: supabaseUser.id },
  });

  if (!existingUser) {
    // Extract name from metadata (set during registration) or fall back to email prefix
    const meta = supabaseUser.user_metadata ?? {};
    const email = supabaseUser.email ?? "";
    const firstName = (meta.first_name as string | undefined) ?? email.split("@")[0];
    const lastName = (meta.last_name as string | undefined) ?? "";

    await prisma.user.create({
      data: {
        supabaseId: supabaseUser.id,
        email,
        firstName,
        lastName,
        phone: meta.phone as string | undefined ?? null,
        role: "CUSTOMER",
      },
    });
  } else {
    // Update last login timestamp
    await prisma.user.update({
      where: { supabaseId: supabaseUser.id },
      data: { lastLoginAt: new Date() },
    });
  }

  // Redirect to the intended destination
  const redirectUrl = next.startsWith("/") ? `${origin}${next}` : `${origin}/customer/dashboard`;
  return NextResponse.redirect(redirectUrl);
}
