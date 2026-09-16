import "server-only";
import type { IntegrationProvider } from "./types";

type ProviderDefinition = {
  id: IntegrationProvider;
  name: string;
  auth: "oauth" | "signed_webhook" | "server_token";
  authorizationGroup: "meta" | "google" | "monday" | "hubspot" | "website";
  selectedResource: string;
};

export const providerCatalog: Record<IntegrationProvider, ProviderDefinition> = {
  meta: { id: "meta", name: "Meta Ads", auth: "oauth", authorizationGroup: "meta", selectedResource: "Meta ad account" },
  google_ads: { id: "google_ads", name: "Google Ads", auth: "oauth", authorizationGroup: "google", selectedResource: "Google Ads customer" },
  ga4: { id: "ga4", name: "Google Analytics 4", auth: "oauth", authorizationGroup: "google", selectedResource: "GA4 property" },
  search_console: { id: "search_console", name: "Google Search Console", auth: "oauth", authorizationGroup: "google", selectedResource: "Search Console property" },
  google_business: { id: "google_business", name: "Google Business Profile", auth: "oauth", authorizationGroup: "google", selectedResource: "Business Profile location" },

  // Internal CRM connections currently use server-side tokens.
  // OAuth can be added later for external WAT clients.
  monday: { id: "monday", name: "Monday.com", auth: "server_token", authorizationGroup: "monday", selectedResource: "Monday board" },
  hubspot: { id: "hubspot", name: "HubSpot", auth: "server_token", authorizationGroup: "hubspot", selectedResource: "HubSpot CRM" },

  website_forms: { id: "website_forms", name: "Website forms", auth: "signed_webhook", authorizationGroup: "website", selectedResource: "Lead ingestion endpoint" },
};

export function parseProvider(value: string): IntegrationProvider | null {
  return value in providerCatalog ? value as IntegrationProvider : null;
}

export function missingProviderConfiguration(provider: IntegrationProvider) {
  const group = providerCatalog[provider].authorizationGroup;

  const requirements: Record<ProviderDefinition["authorizationGroup"], string[]> = {
    meta: ["META_APP_ID", "META_APP_SECRET"],
    google: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLOUD_PROJECT_ID"],
    monday: ["MONDAY_API_TOKEN"],
    hubspot: ["HUBSPOT_ACCESS_TOKEN"],
    website: ["LEAD_INGEST_SECRETS_JSON"],
  };

  const missing = requirements[group].filter((name) => !process.env[name]);

  if (
    group === "website" &&
    !process.env.SUPABASE_SECRET_KEY &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    missing.push("SUPABASE_SECRET_KEY");
  }

  return missing;
}
