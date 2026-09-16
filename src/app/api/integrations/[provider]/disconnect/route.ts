import { NextResponse } from "next/server";
import { requireIntegrationConnection } from "@/lib/integrations/access";
import { parseProvider } from "@/lib/integrations/catalog";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = parseProvider((await params).provider);
  if (!provider) return NextResponse.json({ error: "Unknown integration provider." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { companyId?: string };
  if (!body.companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const access = await requireIntegrationConnection(body.companyId, provider);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.connection.status !== "connected") return NextResponse.json({ error: "This integration is already disconnected." }, { status: 409 });
  return NextResponse.json({ error: "Disconnect is prepared but disabled until token revocation and secure deletion are implemented together." }, { status: 503 });
}
