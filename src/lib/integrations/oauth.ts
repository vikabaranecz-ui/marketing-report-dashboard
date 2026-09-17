import "server-only";

import { createHash, createHmac } from "node:crypto";
import type { ProviderCredential } from "./credentials";
import type { IntegrationProvider } from "./types";
import { providerCatalog } from "./catalog";
import { getGoogleAppConfig } from "./google/app-config";

const googleScopes = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/business.manage",
];

const metaScopes = [
  "ads_read",
  "business_management",
];

export async function buildAuthorizationUrl(
  provider: IntegrationProvider,
  redirectUri: string,
  state: string,
) {
  const group = providerCatalog[provider].authorizationGroup;

  if (group === "meta") {
    const url = new URL("https://www.facebook.com/v26.0/dialog/oauth");

    url.search = new URLSearchParams({
      client_id: required("META_APP_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      scope: metaScopes.join(","),
    }).toString();

    return url.toString();
  }

  if (group === "google") {
    const config = await getGoogleAppConfig();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      scope: googleScopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    }).toString();

    return url.toString();
  }

  if (group === "monday") {
    const verifier = mondayCodeVerifier(state);
    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");

    const url = new URL("https://auth.monday.com/oauth2/authorize");

    url.search = new URLSearchParams({
      client_id: required("MONDAY_CLIENT_ID"),
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

    return url.toString();
  }

  throw new Error(
    "Website forms use signed server-to-server ingestion, not OAuth.",
  );
}

export async function exchangeAuthorizationCode(
  provider: IntegrationProvider,
  code: string,
  redirectUri: string,
  state: string,
  existingCredential?: ProviderCredential | null,
): Promise<ProviderCredential> {
  const group = providerCatalog[provider].authorizationGroup;

  if (group === "google") {
    return exchangeGoogleCode(
      code,
      redirectUri,
      existingCredential,
    );
  }

  if (group === "monday") {
    return exchangeMondayCode(code, redirectUri, state);
  }

  if (group === "meta") {
    return exchangeMetaCode(code, redirectUri);
  }

  throw new Error("This provider does not use OAuth.");
}

async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
  existingCredential?: ProviderCredential | null,
): Promise<ProviderCredential> {
  const config = await getGoogleAppConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  const token = await tokenResponse(response, "Google");

  return {
    accessToken: token.access_token,
    refreshToken:
      token.refresh_token ??
      existingCredential?.refreshToken,
    expiresAt: expiresFromSeconds(token.expires_in),
    scopes: splitScopes(token.scope),
  };
}

async function exchangeMondayCode(
  code: string,
  redirectUri: string,
  state: string,
): Promise<ProviderCredential> {
  const response = await fetch(
    "https://auth.monday.com/oauth_ms/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: required("MONDAY_CLIENT_ID"),
        client_secret: required("MONDAY_CLIENT_SECRET"),
        code,
        redirect_uri: redirectUri,
        code_verifier: mondayCodeVerifier(state),
      }),
      cache: "no-store",
    },
  );

  const token = await tokenResponse(response, "Monday");

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt:
      expiresFromSeconds(token.expires_in) ??
      jwtExpiresAt(token.access_token),
    scopes: splitScopes(token.scope),
  };
}

async function exchangeMetaCode(
  code: string,
  redirectUri: string,
): Promise<ProviderCredential> {
  const shortResponse = await fetch(
    "https://graph.facebook.com/v26.0/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: required("META_APP_ID"),
        client_secret: required("META_APP_SECRET"),
        redirect_uri: redirectUri,
        code,
      }),
      cache: "no-store",
    },
  );

  const shortToken = await tokenResponse(shortResponse, "Meta");

  const longResponse = await fetch(
    "https://graph.facebook.com/v26.0/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: required("META_APP_ID"),
        client_secret: required("META_APP_SECRET"),
        fb_exchange_token: shortToken.access_token,
      }),
      cache: "no-store",
    },
  );

  let token = shortToken;

  if (longResponse.ok) {
    token = await tokenResponse(longResponse, "Meta");
  }

  return {
    accessToken: token.access_token,
    expiresAt: expiresFromSeconds(token.expires_in),
    scopes: metaScopes,
  };
}

function mondayCodeVerifier(state: string) {
  const secret = required("INTEGRATION_STATE_SECRET");

  return createHmac("sha256", secret)
    .update(`monday-pkce:${state}`)
    .digest("base64url");
}

type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

async function tokenResponse(
  response: Response,
  provider: string,
): Promise<OAuthTokenResponse> {
  const body = await response.json().catch(() => ({})) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      typeof body.error_description === "string"
        ? body.error_description
        : typeof body.error === "string"
          ? body.error
          : typeof body.message === "string"
            ? body.message
            : `${provider} returned HTTP ${response.status}`;

    throw new Error(`${provider} OAuth failed: ${message}`);
  }

  if (typeof body.access_token !== "string") {
    throw new Error(`${provider} OAuth response did not contain an access token.`);
  }

  return body as OAuthTokenResponse;
}

function expiresFromSeconds(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return undefined;

  return new Date(Date.now() + seconds * 1000).toISOString();
}

function jwtExpiresAt(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return undefined;

    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: number };

    if (!parsed.exp) return undefined;

    return new Date(parsed.exp * 1000).toISOString();
  } catch {
    return undefined;
  }
}

function splitScopes(scope?: string) {
  if (!scope) return [];

  return scope
    .split(/[ ,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function required(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}.`);
  }

  return value;
}
