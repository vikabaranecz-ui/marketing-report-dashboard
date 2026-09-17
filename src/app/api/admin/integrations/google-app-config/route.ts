import { NextResponse } from "next/server";

import {
  isGoogleAppConfigured,
  putGoogleAppConfig,
} from "@/lib/integrations/google/app-config";
import { parseGoogleAppConfig } from "@/lib/integrations/google/app-config-core";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireAgencyAdmin(request);
  if ("error" in access) return json({ error: access.error }, access.status);

  return json({ configured: await isGoogleAppConfigured() });
}

export async function POST(request: Request) {
  const access = await requireAgencyAdmin(request);
  if ("error" in access) return json({ error: access.error }, access.status);

  let config;
  try {
    const body = await request.json();
    config = parseGoogleAppConfig(body);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid Google application configuration." },
      400,
    );
  }

  try {
    await putGoogleAppConfig(config);
    return json({ configured: true, message: "Google application configuration saved securely." });
  } catch (error) {
    return json(
      {
        error: error instanceof Error
          ? error.message
          : "Unable to save Google application configuration.",
      },
      500,
    );
  }
}

async function requireAgencyAdmin(request: Request) {
  const bearerToken = request.headers.get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  const authClient = bearerToken
    ? createSupabaseAdminClient()
    : await createSupabaseServerClient();
  const { data: authData, error: authError } = await authClient.auth.getClaims(bearerToken);
  const userId = authData?.claims?.sub;

  if (authError || !userId) {
    return { error: "Authentication required. Please sign in again.", status: 401 as const };
  }

  const admin = createSupabaseAdminClient();
  const { data: user, error } = await admin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 as const };
  if (!user || !["super_admin", "agency_admin"].includes(user.role)) {
    return { error: "Agency administrator access is required.", status: 403 as const };
  }

  return { userId };
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
