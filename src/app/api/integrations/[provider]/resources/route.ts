import { NextResponse } from "next/server";

import { requireIntegrationConnection } from "@/lib/integrations/access";
import { parseProvider } from "@/lib/integrations/catalog";
import { credentialStore } from "@/lib/integrations/credentials";
import { getGoogleCredential, isGoogleProvider } from "@/lib/integrations/google/client";
import { discoverGoogleResources } from "@/lib/integrations/google/resources";
import { discoverMetaAdAccounts } from "@/lib/integrations/meta/client";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const provider = parseProvider((await params).provider);
  if (!provider) return json({ error: "Unknown integration provider." }, 404);

  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  if (!companyId) return json({ error: "companyId is required." }, 400);

  const access = await requireIntegrationConnection(companyId, provider);
  if ("error" in access) return json({ error: access.error }, access.status);

  try {
    if (provider === "meta") {
      const credential = await credentialStore.read(access.connection.id, provider);
      if (!credential?.accessToken) return json({ error: "Reconnect Meta before loading ad accounts." }, 409);
      const resources = await discoverMetaAdAccounts(credential.accessToken);
      return json({ resources });
    }

    if (isGoogleProvider(provider)) {
      const credential = await getGoogleCredential(access.connection.id, provider);
      const resources = await discoverGoogleResources(provider, credential.accessToken);
      return json({ resources });
    }

    return json({ error: "Resource discovery is not implemented for this provider." }, 501);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to load provider resources." }, 502);
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
