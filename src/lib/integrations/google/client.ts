import "server-only";

import { credentialStore, type ProviderCredential } from "../credentials";
import type { IntegrationProvider } from "../types";
import { refreshGoogleCredential } from "./core";

export type GoogleProvider =
  | "google_ads"
  | "ga4"
  | "search_console"
  | "google_business";

export async function getGoogleCredential(
  connectionId: string,
  provider: GoogleProvider,
) {
  const credential = await credentialStore.read(connectionId, provider);
  if (!credential?.accessToken) {
    throw new Error("Google authorization is missing. Reconnect Google and try again.");
  }

  if (!isExpired(credential.expiresAt)) return credential;

  const refreshed = await refreshGoogleCredential(credential, {
    clientId: required("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
  });
  await credentialStore.write(connectionId, provider, refreshed);
  return refreshed;
}

export async function googleJson<T>(
  url: string | URL,
  accessToken: string,
  options: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;

  if (!response.ok) {
    const error = body.error && typeof body.error === "object"
      ? body.error as Record<string, unknown>
      : {};
    const detail = typeof error.message === "string"
      ? error.message
      : `HTTP ${response.status}`;
    throw new Error(`Google API request failed: ${detail}`);
  }

  return body as T;
}

export function googleAdsHeaders(loginCustomerId?: string) {
  const developerToken = required("GOOGLE_ADS_DEVELOPER_TOKEN");
  return {
    "developer-token": developerToken,
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

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export type { ProviderCredential };
