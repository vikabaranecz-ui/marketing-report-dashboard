import { NextResponse } from "next/server";
import { requireIntegrationConnection } from "@/lib/integrations/access";
import { missingProviderConfiguration, parseProvider, providerCatalog } from "@/lib/integrations/catalog";
import { credentialStore } from "@/lib/integrations/credentials";
import { buildAuthorizationUrl } from "@/lib/integrations/oauth";
import { createOAuthState } from "@/lib/integrations/oauth-state";
import { validateRobawsCredentials } from "@/lib/integrations/robaws-client";
import { ensureWebsiteFormsCredential } from "@/lib/integrations/website-forms";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const provider = parseProvider((await params).provider);

  if (!provider) {
    return NextResponse.json(
      { error: "Unknown integration provider." },
      { status: 404 },
    );
  }

  const companyId =
    new URL(request.url).searchParams.get("companyId") ?? "";

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required." },
      { status: 400 },
    );
  }

  const access = await requireIntegrationConnection(companyId, provider);

  if ("error" in access) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const missing = missingProviderConfiguration(provider);

  if (missing.length) {
    return NextResponse.json(
      {
        error:
          `${providerCatalog[provider].name} is not configured yet. ` +
          `Missing server settings: ${missing.join(", ")}.`,
      },
      { status: 503 },
    );
  }

  const definition = providerCatalog[provider];

  if (provider === "website_forms") {
    try {
      const credential = await ensureWebsiteFormsCredential(
        access.connection.id,
        credentialStore,
      );
      const now = new Date().toISOString();
      const { error } = await access.supabase
        .from("reporting_integration_connections")
        .update({
          configuration: { endpoint_name: "/api/leads/ingest" },
          status: "connected",
          error_message: null,
          updated_at: now,
        })
        .eq("id", access.connection.id);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        message: credential.created
          ? "Website forms connected. Rotate the signing secret to retrieve a one-time value for the website server."
          : "Website forms reconnected using the existing signing secret.",
        secretCreated: credential.created,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error
            ? error.message
            : "Unable to configure Website forms.",
        },
        { status: 500 },
      );
    }
  }

  if (definition.auth === "server_token") {
    const now = new Date().toISOString();

    if (provider === "robaws") {
      try {
        await validateRobawsCredentials();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "ROBAWS credential validation failed.";

        const { error: saveError } = await access.supabase
          .from("reporting_integration_connections")
          .update({
            status: "error",
            error_message: message,
            updated_at: now,
          })
          .eq("id", access.connection.id);

        if (saveError) {
          return NextResponse.json(
            {
              error:
                `${message} Unable to save the connection error: ${saveError.message}`,
            },
            { status: 500 },
          );
        }

        return NextResponse.json(
          { error: message },
          { status: 502 },
        );
      }
    }

    const { error } = await access.supabase
      .from("reporting_integration_connections")
      .update({
        status: "connected",
        error_message: null,
        updated_at: now,
      })
      .eq("id", access.connection.id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: `${definition.name} connected using the configured server credential.`,
    });
  }

  if (process.env.OAUTH_TOKEN_STORAGE_REVIEWED !== "true") {
    return NextResponse.json(
      {
        error:
          "OAuth is prepared but intentionally disabled until private token storage has completed security review.",
      },
      { status: 503 },
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri =
    `${origin}/api/integrations/${provider}/callback`;

  const state = createOAuthState({
    companyId,
    provider,
    userId: access.user.id,
  });

  const authorizationUrl =
    buildAuthorizationUrl(provider, redirectUri, state);

  const { error } = await access.supabase
    .from("reporting_integration_connections")
    .update({
      status: "connecting",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", access.connection.id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ authorizationUrl });
}
