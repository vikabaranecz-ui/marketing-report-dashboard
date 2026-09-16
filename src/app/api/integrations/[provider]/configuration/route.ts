import { NextResponse } from "next/server";
import { requireIntegrationConnection } from "@/lib/integrations/access";
import { parseProvider } from "@/lib/integrations/catalog";

const safeKeys = new Set(["account_id","account_name","ad_account_id","ad_account_name","customer_id","customer_name","property_id","property_name","site_url","location_id","location_name","board_id","board_name","endpoint_name","monday_columns"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = parseProvider((await params).provider);
  if (!provider) return NextResponse.json({ error: "Unknown integration provider." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { companyId?: string; configuration?: Record<string, unknown> };
  if (!body.companyId || !body.configuration) return NextResponse.json({ error: "companyId and configuration are required." }, { status: 400 });
  const invalid = Object.keys(body.configuration).filter((key) => !safeKeys.has(key));
  if (invalid.length) return NextResponse.json({ error: `Secret or unsupported configuration fields are not accepted: ${invalid.join(", ")}.` }, { status: 400 });
  if (!isSafeConfiguration(body.configuration)) return NextResponse.json({ error: "Configuration values must contain only resource identifiers, display names, URLs, or Monday column IDs." }, { status: 400 });
  const access = await requireIntegrationConnection(body.companyId, provider);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const configuration = { ...(access.connection.configuration as Record<string, unknown>), ...body.configuration };
  const { error } = await access.supabase.from("reporting_integration_connections").update({ configuration, updated_at: new Date().toISOString() }).eq("id", access.connection.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Resource selection saved." });
}

function isSafeConfiguration(configuration: Record<string, unknown>) {
  return Object.entries(configuration).every(([key, value]) => {
    if (key === "monday_columns") return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.values(value as Record<string, unknown>).every((column) => typeof column === "string" && column.length <= 200);
    return typeof value === "string" && value.length <= 2000;
  });
}
