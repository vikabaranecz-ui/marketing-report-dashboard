import { NextResponse } from "next/server";
import { requireIntegrationConnection } from "@/lib/integrations/access";
import { parseProvider } from "@/lib/integrations/catalog";
import { credentialStore } from "@/lib/integrations/credentials";
import { getGoogleCredential, isGoogleProvider } from "@/lib/integrations/google/client";
import { findAccessibleResource } from "@/lib/integrations/google/core";
import { discoverGoogleResources, googleResourceConfiguration } from "@/lib/integrations/google/resources";
import { discoverMetaAdAccounts } from "@/lib/integrations/meta/client";
import { normalizeMetaAdAccountId } from "@/lib/integrations/meta/core";

export const runtime = "nodejs";

const safeKeys = new Set(["account_id","account_name","ad_account_id","ad_account_name","customer_id","customer_name","login_customer_id","currency","timezone","property_id","property_name","site_url","location_id","location_name","board_id","board_name","portal_id","portal_name","pipeline_id","pipeline_name","endpoint_name","monday_columns"]);

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
  let requestedConfiguration = body.configuration;

  if (provider === "meta") {
    const requestedId = typeof body.configuration.ad_account_id === "string"
      ? normalizeMetaAdAccountId(body.configuration.ad_account_id)
      : "";
    if (!requestedId) return NextResponse.json({ error: "Select a Meta ad account." }, { status: 400 });

    try {
      const credential = await credentialStore.read(access.connection.id, provider);
      if (!credential?.accessToken) return NextResponse.json({ error: "Reconnect Meta before selecting an ad account." }, { status: 409 });
      const accounts = await discoverMetaAdAccounts(credential.accessToken);
      const selected = accounts.find(account => account.id === requestedId);
      if (!selected) return NextResponse.json({ error: "That ad account is not accessible to the authorized Meta user." }, { status: 403 });
      requestedConfiguration = {
        ad_account_id: selected.id,
        ad_account_name: selected.name,
      };
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to validate the Meta ad account." }, { status: 502 });
    }
  } else if (isGoogleProvider(provider)) {
    const requestedId = googleRequestedResourceId(provider, body.configuration);
    if (!requestedId) return NextResponse.json({ error: "Select a Google resource." }, { status: 400 });

    try {
      const credential = await getGoogleCredential(access.connection.id, provider);
      const resources = await discoverGoogleResources(provider, credential.accessToken);
      const selected = findAccessibleResource(resources, requestedId);
      if (!selected) return NextResponse.json({ error: "That resource is not accessible to the authorized Google user." }, { status: 403 });
      requestedConfiguration = googleResourceConfiguration(provider, selected);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to validate the Google resource." }, { status: 502 });
    }
  }

  const configuration = isGoogleProvider(provider)
    ? requestedConfiguration
    : { ...(access.connection.configuration as Record<string, unknown>), ...requestedConfiguration };
  const { error } = await access.supabase.from("reporting_integration_connections").update({ configuration, updated_at: new Date().toISOString() }).eq("id", access.connection.id).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Resource selection saved.", configuration });
}

function googleRequestedResourceId(
  provider: "google_ads" | "ga4" | "search_console" | "google_business",
  configuration: Record<string, unknown>,
) {
  const key = {
    google_ads: "customer_id",
    ga4: "property_id",
    search_console: "site_url",
    google_business: "location_id",
  }[provider];
  const value = configuration[key];
  return typeof value === "string" ? value.trim() : "";
}

function isSafeConfiguration(configuration: Record<string, unknown>) {
  return Object.entries(configuration).every(([key, value]) => {
    if (key === "monday_columns") return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.values(value as Record<string, unknown>).every((column) => typeof column === "string" && column.length <= 200);
    return typeof value === "string" && value.length <= 2000;
  });
}
