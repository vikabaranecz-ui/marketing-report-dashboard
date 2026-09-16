import { NextResponse } from "next/server";

import { requireIntegrationConnection } from "@/lib/integrations/access";
import { parseProvider, providerCatalog } from "@/lib/integrations/catalog";
import { syncCrmProvider } from "@/lib/integrations/crm-sync";
import { syncMetaProvider } from "@/lib/integrations/meta-sync";
import { syncRobawsProvider } from "@/lib/integrations/robaws-sync";
import type { ConnectionConfiguration, IntegrationProvider } from "@/lib/integrations/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type StandardSyncResult = {
  recordsImported: number;
  leadsImported: number;
  leadsMatched?: number;
  dealsImported: number;
  quotesImported?: number;
  projectsImported: number;
  invoicesImported?: number;
  revenueImported: number;
};

type MetaSyncResult = Awaited<ReturnType<typeof syncMetaProvider>>;
type SyncResult = StandardSyncResult | MetaSyncResult;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const provider = parseProvider((await params).provider);

  if (!provider) {
    return json({ error: "Unknown integration provider." }, 404);
  }

  const body = await request.json().catch(() => ({})) as { companyId?: string };

  if (!body.companyId) {
    return json({ error: "companyId is required." }, 400);
  }

  const access = await requireIntegrationConnection(body.companyId, provider);

  if ("error" in access) {
    return json({ error: access.error }, access.status);
  }

  if (access.connection.status !== "connected") {
    return json(
      { error: `${providerCatalog[provider].name} is not connected.` },
      409,
    );
  }

  if (!isManualSyncProvider(provider)) {
    return json(
      { error: `${providerCatalog[provider].name} data sync is not implemented yet.` },
      503,
    );
  }

  let admin: AdminClient;

  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return json({ error: errorMessage(error, "Server-side sync access is not configured.") }, 500);
  }

  const startedAt = new Date().toISOString();
  const configuredAdAccountId = provider === "meta" &&
    typeof access.connection.configuration?.ad_account_id === "string"
    ? access.connection.configuration.ad_account_id
    : null;
  const logResult = await admin
    .from("sync_logs")
    .insert({
      integration_connection_id: access.connection.id,
      started_at: startedAt,
      status: "running",
      records_imported: 0,
      metadata: provider === "meta"
        ? {
            trigger: "manual",
            provider,
            companyId: body.companyId,
            adAccountId: configuredAdAccountId,
          }
        : { trigger: "manual", provider },
    })
    .select("id")
    .single();

  if (logResult.error) {
    return json(
      { error: `Unable to start the sync log: ${logResult.error.message}` },
      500,
    );
  }

  const attemptResult = await admin
    .from("reporting_integration_connections")
    .update({
      last_attempted_sync: startedAt,
      error_message: null,
      updated_at: startedAt,
    })
    .eq("id", access.connection.id)
    .select("id")
    .single();

  if (attemptResult.error) {
    const message = `Unable to save the sync attempt: ${attemptResult.error.message}`;
    const loggingErrors = await persistFailure(
      admin,
      access.connection.id,
      logResult.data.id,
      startedAt,
      message,
    );
    return json({ error: appendPersistenceErrors(message, loggingErrors) }, 500);
  }

  let result: SyncResult;

  try {
    result = provider === "robaws"
      ? await syncRobawsProvider(body.companyId)
      : provider === "meta"
        ? await syncMetaProvider(
            access.connection.id,
            body.companyId,
            access.connection.configuration as ConnectionConfiguration,
          )
        : await syncCrmProvider(
          provider,
          body.companyId,
          access.connection.configuration as Record<string, unknown>,
        );
  } catch (error) {
    const message = errorMessage(error, `${providerCatalog[provider].name} sync failed.`);
    const loggingErrors = await persistFailure(
      admin,
      access.connection.id,
      logResult.data.id,
      startedAt,
      message,
    );
    return json({ error: appendPersistenceErrors(message, loggingErrors) }, 502);
  }

  const completedAt = new Date().toISOString();
  const metadata = provider === "meta"
    ? metaSyncMetadata(
        result as MetaSyncResult,
        body.companyId,
        configuredAdAccountId,
      )
    : standardSyncMetadata(
        provider,
        result as StandardSyncResult,
      );

  const logSuccess = await admin
    .from("sync_logs")
    .update({
      completed_at: completedAt,
      status: "success",
      records_imported: result.recordsImported,
      error_message: null,
      metadata,
    })
    .eq("id", logResult.data.id)
    .select("id")
    .single();

  if (logSuccess.error) {
    return json(
      { error: `The provider sync completed, but its success log could not be saved: ${logSuccess.error.message}` },
      500,
    );
  }

  const connectionSuccess = await admin
    .from("reporting_integration_connections")
    .update({
      status: "connected",
      last_successful_sync: completedAt,
      last_attempted_sync: startedAt,
      error_message: null,
      updated_at: completedAt,
    })
    .eq("id", access.connection.id)
    .select("id")
    .single();

  if (connectionSuccess.error) {
    return json(
      { error: `The provider sync completed, but the integration state could not be updated: ${connectionSuccess.error.message}` },
      500,
    );
  }

  return json({
    message: successMessage(provider, result),
    provider,
    startedAt,
    completedAt,
    ...result,
  });
}

function isManualSyncProvider(provider: IntegrationProvider): provider is "meta" | "monday" | "hubspot" | "robaws" {
  return provider === "meta" || provider === "monday" || provider === "hubspot" || provider === "robaws";
}

function successMessage(provider: "meta" | "monday" | "hubspot" | "robaws", result: SyncResult) {
  if (provider === "meta") {
    const meta = result as MetaSyncResult;
    return `Meta Ads synced successfully: ${meta.dailyRowsImported} daily ad rows · ${meta.campaignsImported} campaigns · ${meta.adsetsImported} ad sets · ${meta.adsImported} ads.`;
  }

  const standard = result as StandardSyncResult;

  if (provider === "robaws") {
    return `ROBAWS synced successfully: ${standard.leadsMatched ?? standard.leadsImported} matched leads · ${standard.quotesImported ?? 0} offers · ${standard.projectsImported} projects · ${standard.invoicesImported ?? 0} invoices · ${standard.revenueImported} revenue records.`;
  }

  return `${providerCatalog[provider].name} synced successfully: ${standard.leadsImported} leads · ${standard.dealsImported} deals · ${standard.projectsImported} projects · ${standard.revenueImported} revenue records.`;
}

function metaSyncMetadata(
  result: MetaSyncResult,
  companyId: string,
  configuredAdAccountId: string | null,
) {
  return {
    trigger: "manual",
    provider: "meta",
    dailyRowsImported: result.dailyRowsImported,
    campaignsImported: result.campaignsImported,
    adsetsImported: result.adsetsImported,
    adsImported: result.adsImported,
    dateFrom: result.dateFrom,
    dateTo: result.dateTo,
    earliestDate: result.earliestDate,
    latestDate: result.latestDate,
    totalSpend: result.totalSpend,
    selectedAdAccountId: result.selectedAdAccountId,
    monthlySpend: result.monthlySpend,
    missingMonths: result.missingMonths,
    companyId,
    adAccountId:
      result.selectedAdAccountId ?? configuredAdAccountId,
    spendImported: result.totalSpend,
    firstDate: result.earliestDate,
    lastDate: result.latestDate,
  };
}

function standardSyncMetadata(
  provider: "monday" | "hubspot" | "robaws",
  result: StandardSyncResult,
) {
  return {
    trigger: "manual",
    provider,
    leadsImported: result.leadsImported,
    leadsMatched:
      result.leadsMatched ?? result.leadsImported,
    dealsImported: result.dealsImported,
    quotesImported: result.quotesImported ?? 0,
    projectsImported: result.projectsImported,
    invoicesImported: result.invoicesImported ?? 0,
    revenueImported: result.revenueImported,
  };
}

async function persistFailure(
  admin: AdminClient,
  connectionId: string,
  logId: number | string,
  startedAt: string,
  message: string,
) {
  const completedAt = new Date().toISOString();
  const [connectionResult, logResult] = await Promise.all([
    admin
      .from("reporting_integration_connections")
      .update({
        status: "error",
        last_attempted_sync: startedAt,
        error_message: message,
        updated_at: completedAt,
      })
      .eq("id", connectionId)
      .select("id")
      .single(),
    admin
      .from("sync_logs")
      .update({
        completed_at: completedAt,
        status: "error",
        error_message: message,
      })
      .eq("id", logId)
      .select("id")
      .single(),
  ]);

  return [
    connectionResult.error
      ? `integration state: ${connectionResult.error.message}`
      : null,
    logResult.error
      ? `sync log: ${logResult.error.message}`
      : null,
  ].filter((value): value is string => Boolean(value));
}

function appendPersistenceErrors(message: string, errors: string[]) {
  return errors.length
    ? `${message} Additionally unable to persist ${errors.join("; ")}.`
    : message;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
