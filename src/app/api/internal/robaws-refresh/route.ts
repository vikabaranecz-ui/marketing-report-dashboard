import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { syncRobawsProvider } from "@/lib/integrations/robaws-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const companyId = url.searchParams.get("companyId") ?? "";
  if (!token || !companyId) return NextResponse.json({ error: "Missing token or companyId." }, { status: 400 });

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
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 403 });
  }

  const consumed = await admin
    .from("internal_job_tokens")
    .update({ used_at: now })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .select("token_hash")
    .maybeSingle();

  if (consumed.error || !consumed.data) return NextResponse.json({ error: "Token already used." }, { status: 409 });

  try {
    const result = await syncRobawsProvider(companyId);
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ROBAWS refresh failed." }, { status: 502 });
  }
}
