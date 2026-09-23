import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { syncRobawsProvider } from "@/lib/integrations/robaws-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const companyId = url.searchParams.get("companyId") ?? "";
  if (!token || !companyId) return json({ error: "Missing one-time token or companyId." }, 400);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("internal_job_tokens")
    .select("token_hash,job,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .eq("job", "robaws-one-time-refresh")
    .maybeSingle();

  if (error || !data || data.used_at || data.expires_at <= now) {
    return json({ error: "One-time token is invalid or expired." }, 403);
  }

  const consume = await admin
    .from("internal_job_tokens")
    .update({ used_at: now })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .select("token_hash")
    .maybeSingle();

  if (consume.error || !consume.data) return json({ error: "One-time token has already been used." }, 409);

  try {
    const result = await syncRobawsProvider(companyId);
    return json({ ok: true, result });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "ROBAWS refresh failed." }, 502);
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
