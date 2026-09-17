import "server-only";

import { credentialStore, type ProviderCredential } from "../credentials";
import type { IntegrationProvider } from "../types";
import { getGoogleAppConfig } from "./app-config";
import { refreshGoogleCredential } from "./core";
import { requestGoogleJson, type GoogleApiContext } from "./http-core";

export type GoogleProvider =
  | "google_ads"
  | "ga4"
  | "search_console"
  | "google_business";

export async function getGoogleCredential(
  connectionId: string,
  provider: GoogleProvider,
) {
  const config = await getGoogleAppConfig();
  const credential = await credentialStore.read(connectionId, provider);
  if (!credential?.accessToken) {
    throw new Error("Google authorization is missing. Reconnect Google and try again.");
  }

  if (!isExpired(credential.expiresAt)) return credential;

  const refreshed = await refreshGoogleCredential(credential, {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
  await credentialStore.write(connectionId, provider, refreshed);
  return refreshed;
}

export async function googleJson<T>(
  url: string | URL,
  accessToken: string,
  options: RequestInit = {},
  extraHeaders: Record<string, string> = {},
  context: GoogleApiContext = { apiName: "Google API" },
): Promise<T> {
  return requestGoogleJson<T>(url, accessToken, {
    request: options,
    headers: extraHeaders,
    context,
  });
}

export function googleAdsHeaders(loginCustomerId?: string) {
  return {
    ...(loginCustomerId
      ? { "login-customer-id": loginCustomerId.replace(/\D/g, "") }
      : {}),
  };
}

export function isGoogleProvider(
  provider: IntegrationProvider,
): provider is GoogleProvider {
  return provider === "google_ads" ||
    provider === "ga4" ||
    provider === "search_console" ||
    provider === "google_business";
}

function isExpired(expiresAt?: string) {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt).getTime();
  return !Number.isFinite(expires) || expires <= Date.now() + 60_000;
}

export type { ProviderCredential };
