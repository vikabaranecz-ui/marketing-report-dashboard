import "server-only";
import type { IntegrationProvider } from "./types";

type ProviderDefinition = {
  id: IntegrationProvider;
  name: string;
  auth: "oauth" | "signed_webhook";
  authorizationGroup: "meta" | "google" | "monday" | "website";
  selectedResource: string;
};

export const providerCatalog: Record<IntegrationProvider, ProviderDefinition> = {
  meta: { id: "meta", name: "Meta Ads", auth: "oauth", authorizationGroup: "meta", selectedResource: "Meta ad account" },
  google_ads: { id: "google_ads", name: "Google Ads", auth: "oauth", authorizationGroup: "google", selectedResource: "Google Ads customer" },
  ga4: { id: "ga4", name: "Google Analytics 4", auth: "oauth", authorizationGroup: "google", selectedResource: "GA4 property" },
  search_console: { id: "search_console", name: "Google Search Console", auth: "oauth", authorizationGroup: "google", selectedResource: "Search Console property" },
  google_business: { id: "google_business", name: "Google Business Profile", auth: "oauth", authorizationGroup: "google", selectedResource: "Business Profile location" },
  monday: { id: "monday", name: "Monday.com", auth: "oauth", authorizationGroup: "monday", selectedResource: "Monday board" },
  website_forms: { id: "website_forms", name: "Website forms", auth: "signed_webhook", authorizationGroup: "website", selectedResource: "Lead ingestion endpoint" },
};

export function parseProvider(value: string): IntegrationProvider | null {
  return value in providerCatalog ? value as IntegrationProvider : null;
}

export function missingProviderConfiguration(provider: IntegrationProvider) {
  const group = providerCatalog[provider].authorizationGroup;
  const requirements: Record<typeof group, string[]> = {
    meta: ["META_APP_ID", "META_APP_SECRET"],
    google: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLOUD_PROJECT_ID"],
    monday: ["MONDAY_CLIENT_ID", "MONDAY_CLIENT_SECRET"],
    website: ["LEAD_INGEST_SECRETS_JSON"],
  };
  const missing = requirements[group].filter((name) => !process.env[name]);
  if (group === "website" && !process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SECRET_KEY");
  return missing;
}
