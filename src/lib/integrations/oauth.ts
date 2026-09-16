import "server-only";
import type { IntegrationProvider } from "./types";
import { providerCatalog } from "./catalog";

const googleScopes = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/business.manage",
];

export function buildAuthorizationUrl(provider: IntegrationProvider, redirectUri: string, state: string) {
  const group = providerCatalog[provider].authorizationGroup;
  if (group === "meta") {
    const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");
    url.search = new URLSearchParams({ client_id: required("META_APP_ID"), redirect_uri: redirectUri, response_type: "code", state, scope: "ads_read,business_management,leads_retrieval" }).toString();
    return url.toString();
  }
  if (group === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: required("GOOGLE_OAUTH_CLIENT_ID"), redirect_uri: redirectUri, response_type: "code", state, scope: googleScopes.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true" }).toString();
    return url.toString();
  }
  if (group === "monday") {
    const url = new URL("https://auth.monday.com/oauth2/authorize");
    url.search = new URLSearchParams({ client_id: required("MONDAY_CLIENT_ID"), redirect_uri: redirectUri, state }).toString();
    return url.toString();
  }
  throw new Error("Website forms use signed server-to-server ingestion, not OAuth.");
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
