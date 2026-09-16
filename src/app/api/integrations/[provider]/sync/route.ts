import { NextResponse } from "next/server";
import { requireIntegrationConnection } from "@/lib/integrations/access";
import { parseProvider, providerCatalog } from "@/lib/integrations/catalog";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = parseProvider((await params).provider);
  if (!provider) return NextResponse.json({ error: "Unknown integration provider." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { companyId?: string };
  if (!body.companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const access = await requireIntegrationConnection(body.companyId, provider);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.connection.status !== "connected") return NextResponse.json({ error: `${providerCatalog[provider].name} is not connected.` }, { status: 409 });

  const startedAt = new Date().toISOString();
  const errorMessage = "Sync execution is disabled until the reviewed credential store and provider account selection are available.";
  await access.supabase.from("reporting_integration_connections").update({ status: "error", last_attempted_sync: startedAt, error_message: errorMessage, updated_at: startedAt }).eq("id", access.connection.id);
  await access.supabase.from("sync_logs").insert({ integration_connection_id: access.connection.id, started_at: startedAt, completed_at: new Date().toISOString(), status: "error", records_imported: 0, error_message: errorMessage, metadata: { trigger: "manual", provider } });
  return NextResponse.json({ error: errorMessage }, { status: 503 });
}
