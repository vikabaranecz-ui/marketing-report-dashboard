import { NextResponse } from "next/server";

import { requireIntegrationConnection } from "@/lib/integrations/access";
import {
  parseProvider,
  providerCatalog,
} from "@/lib/integrations/catalog";
import { credentialStore } from "@/lib/integrations/credentials";
import {
  exchangeAuthorizationCode,
} from "@/lib/integrations/oauth";
import {
  verifyOAuthState,
} from "@/lib/integrations/oauth-state";
import { parseMetaPermissionRows } from "@/lib/integrations/meta/production-core";

export const runtime = "nodejs";

const googleProviders = [
  "google_ads",
  "ga4",
  "search_console",
  "google_business",
] as const;

const incompleteAuthorizationMessage =
  "Authorization was cancelled or incomplete.";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ provider: string }>;
  },
) {
  const provider = parseProvider((await params).provider);

  if (!provider) {
    return NextResponse.json(
      { error: "Unknown integration provider." },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const stateValue = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const providerReportedError = [
    "error",
    "error_reason",
    "error_description",
  ].some((parameter) => url.searchParams.has(parameter));

  if (!stateValue) {
    return NextResponse.redirect(
      new URL(
        `/integrations?integration_error=${encodeURIComponent(incompleteAuthorizationMessage)}`,
        url.origin,
      ),
    );
  }

  let resetConnection:
    | ((message: string) => Promise<void>)
    | null = null;

  try {
    const state = verifyOAuthState(stateValue);

    if (state.provider !== provider) {
      throw new Error("Provider mismatch in OAuth state.");
    }

    const access = await requireIntegrationConnection(
      state.companyId,
      provider,
    );

    if (
      "error" in access ||
      access.user.id !== state.userId
    ) {
      throw new Error(
        "The authorization session is no longer valid.",
      );
    }

    if (provider === "meta") {
      resetConnection = async (message: string) => {
        const { error } = await access.supabase
          .from("reporting_integration_connections")
          .update({
            status: "not_connected",
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", access.connection.id)
          .eq("company_id", state.companyId)
          .eq("provider", provider)
          .select("id")
          .single();

        if (error) {
          throw new Error(
            `Unable to reset the cancelled authorization: ${error.message}`,
          );
        }
      };
    }

    if (!code || (provider === "meta" && providerReportedError)) {
      if (resetConnection) {
        await resetConnection(incompleteAuthorizationMessage);
      }

      return NextResponse.redirect(
        new URL(
          `/integrations?integration_error=${encodeURIComponent(incompleteAuthorizationMessage)}`,
          url.origin,
        ),
      );
    }

    if (!credentialStore.ready) {
      throw new Error(
        "Secure credential storage is unavailable.",
      );
    }

    const existingCredential =
      await credentialStore.read(
        access.connection.id,
        provider,
      );

    const redirectUri =
      `${url.origin}/api/integrations/${provider}/callback`;

    const credential =
      await exchangeAuthorizationCode(
        provider,
        code,
        redirectUri,
        stateValue,
        existingCredential,
      );

    const group =
      providerCatalog[provider].authorizationGroup;

    if (group === "google") {
      const {
        data: connections,
        error: connectionsError,
      } = await access.supabase
        .from("reporting_integration_connections")
        .select("id,provider")
        .eq("company_id", state.companyId)
        .in("provider", [...googleProviders]);

      if (connectionsError) {
        throw new Error(connectionsError.message);
      }

      for (const connection of connections ?? []) {
        const connectionProvider =
          parseProvider(connection.provider);

        if (!connectionProvider) continue;

        await credentialStore.write(
          connection.id,
          connectionProvider,
          credential,
        );
      }

      const ids = (connections ?? [])
        .map((connection) => connection.id);

      if (ids.length) {
        const { error } = await access.supabase
          .from("reporting_integration_connections")
          .update({
            status: "connected",
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .in("id", ids);

        if (error) throw new Error(error.message);
      }
    } else {
      await credentialStore.write(
        access.connection.id,
        provider,
        credential,
      );

      const metaReadiness = provider === "meta"
        ? parseMetaPermissionRows(Object.entries(credential.permissionStatuses ?? {}).map(
            ([permission, status]) => ({ permission, status }),
          ))
        : null;

      const { error } = await access.supabase
        .from("reporting_integration_connections")
        .update({
          status: "connected",
          error_message: null,
          ...(metaReadiness ? {
            configuration: {
              ...(access.connection.configuration ?? {}),
              meta_permission_status: metaReadiness.status,
              meta_granted_permissions: metaReadiness.granted,
              meta_missing_permissions: metaReadiness.missing,
            },
          } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", access.connection.id);

      if (error) throw new Error(error.message);
    }

    return NextResponse.redirect(
      new URL(
        `/integrations?integration_connected=${encodeURIComponent(provider)}`,
        url.origin,
      ),
    );
  } catch (error) {
    let message =
      error instanceof Error
        ? error.message
        : "Invalid OAuth callback.";

    if (resetConnection) {
      try {
        await resetConnection(message);
      } catch (resetError) {
        const resetMessage =
          resetError instanceof Error
            ? resetError.message
            : "Unable to reset the integration state.";
        message = `${message} ${resetMessage}`;
      }
    }

    return NextResponse.redirect(
      new URL(
        `/integrations?integration_error=${encodeURIComponent(message)}`,
        url.origin,
      ),
    );
  }
}
