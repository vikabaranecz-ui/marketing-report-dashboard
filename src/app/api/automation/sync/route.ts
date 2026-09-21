import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runAutomatedSync, type AutomationScope } from "@/lib/integrations/automated-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = request.headers.get("x-automation-secret")?.trim() ?? "";
  if (!secret || !(await authorized(secret))) {
    return NextResponse.json({ error: "Unauthorized automation request." }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = parseScope(url.searchParams.get("scope"));

  try {
    const result = await runAutomatedSync(scope);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Automated sync failed." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

async function authorized(secret: string) {
  const admin = createSupabaseAdminClient();
  const digest = createHash("sha256").update(secret).digest("hex");
  const { data, error } = await admin
    .from("reporting_automation_settings")
    .select("token_sha256")
    .eq("enabled", true);

  if (error || !data?.length) return false;

  const candidate = Buffer.from(digest, "hex");
  return data.some((row) => {
    if (typeof row.token_sha256 !== "string" || row.token_sha256.length !== digest.length) return false;
    return timingSafeEqual(candidate, Buffer.from(row.token_sha256, "hex"));
  });
}

function parseScope(value: string | null): AutomationScope {
  return value === "marketing" || value === "all" ? value : "operational";
}
