import "server-only";

import { syncCrmProvider } from "@/lib/integrations/crm-sync";
import { isGoogleProvider } from "@/lib/integrations/google/client";
import { syncGoogleProvider } from "@/lib/integrations/google-sync";
import { syncMetaProvider } from "@/lib/integrations/meta-sync";
import { syncRobawsProvider } from "@/lib/integrations/robaws-sync";
import type { ConnectionConfiguration, IntegrationProvider } from "@/lib/integrations/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AutomationScope = "operational" | "marketing" | "all";

type ConnectionRow = {
  id: string;
  company_id: string;
  provider: IntegrationProvider;
  status: string;
  configuration: Record<string, unknown> | null;
};

type Snapshot = {
  leads: number;
  signed: number;
  commercial_clients: number;
  open_offers: number;
  open_pipeline: number;
  project_value: number;
  invoiced: number;
  paid: number;
  spend_ytd: number;
};

const operationalProviders = new Set<IntegrationProvider>(["monday", "hubspot", "robaws"]);
const marketingProviders = new Set<IntegrationProvider>(["meta", "google_ads", "ga4", "search_console", "google_business"]);

export async function runAutomatedSync(scope: AutomationScope) {
  const admin = createSupabaseAdminClient();
  const { data: settings, error: settingsError } = await admin
    .from("reporting_automation_settings")
    .select("company_id,enabled")
    .eq("enabled", true);

  if (settingsError) throw new Error(`Unable to load automation settings: ${settingsError.message}`);

  const companyIds = (settings ?? []).map((row) => row.company_id);
  if (!companyIds.length) return { scope, providers: [], changes: 0 };

  const { data, error } = await admin
    .from("reporting_integration_connections")
    .select("id,company_id,provider,status,configuration")
    .in("company_id", companyIds)
    .eq("status", "connected");

  if (error) throw new Error(`Unable to load connected integrations: ${error.message}`);

  const connections = ((data ?? []) as ConnectionRow[])
    .filter((connection) => shouldRun(scope, connection.provider))
    .filter(isConfiguredForAutomation);

  const results: Array<{
    companyId: string;
    provider: string;
    status: "success" | "error";
    recordsImported: number;
    changes: number;
    error?: string;
  }> = [];

  for (const connection of connections) {
    try {
      results.push(await runConnection(connection));
    } catch (error) {
      results.push({
        companyId: connection.company_id,
        provider: connection.provider,
        status: "error",
        recordsImported: 0,
        changes: 0,
        error: error instanceof Error ? error.message : "Automated sync failed.",
      });
    }
  }

  return {
    scope,
    providers: results,
    changes: results.reduce((sum, row) => sum + row.changes, 0),
  };
}

function isConfiguredForAutomation(connection: ConnectionRow) {
  const configuration = connection.configuration ?? {};
  if (connection.provider === "meta") return Boolean(configuration.ad_account_id);
  if (connection.provider === "google_ads") return Boolean(configuration.customer_id);
  if (connection.provider === "ga4") return Boolean(configuration.property_id);
  if (connection.provider === "search_console") return Boolean(configuration.site_url);
  if (connection.provider === "google_business") return Boolean(configuration.location_id);
  if (connection.provider === "monday") return Boolean(configuration.board_id);
  if (connection.provider === "hubspot") return Boolean(configuration.portal_id);
  return connection.provider === "robaws";
}

function shouldRun(scope: AutomationScope, provider: IntegrationProvider) {
  if (scope === "all") return operationalProviders.has(provider) || marketingProviders.has(provider);
  return scope === "operational" ? operationalProviders.has(provider) : marketingProviders.has(provider);
}

async function runConnection(connection: ConnectionRow) {
  const admin = createSupabaseAdminClient();
  const startedAt = new Date().toISOString();
  const before = await snapshot(connection.company_id);

  const { data: log, error: logError } = await admin
    .from("sync_logs")
    .insert({
      integration_connection_id: connection.id,
      started_at: startedAt,
      status: "running",
      records_imported: 0,
      metadata: {
        trigger: "automation",
        provider: connection.provider,
        companyId: connection.company_id,
      },
    })
    .select("id")
    .single();

  if (logError) throw new Error(`Unable to start automated sync log: ${logError.message}`);

  await admin
    .from("reporting_integration_connections")
    .update({
      last_attempted_sync: startedAt,
      error_message: null,
      updated_at: startedAt,
    })
    .eq("id", connection.id);

  try {
    const result = await dispatchSync(connection);
    const completedAt = new Date().toISOString();
    const after = await snapshot(connection.company_id);
    const events = changeEvents(connection, log.id, before, after, completedAt);

    if (events.length) {
      const { error: eventError } = await admin.from("reporting_change_events").insert(events);
      if (eventError) throw new Error(`Unable to save change feed: ${eventError.message}`);
    }

    const { error: logUpdateError } = await admin
      .from("sync_logs")
      .update({
        completed_at: completedAt,
        status: "success",
        records_imported: result.recordsImported,
        error_message: null,
        metadata: {
          trigger: "automation",
          provider: connection.provider,
          companyId: connection.company_id,
          sync: result,
          changes: events.map((event) => ({
            metric: event.metric_key,
            delta: event.delta,
          })),
        },
      })
      .eq("id", log.id);

    if (logUpdateError) throw new Error(`Unable to complete automated sync log: ${logUpdateError.message}`);

    const update: Record<string, unknown> = {
      status: "connected",
      last_successful_sync: completedAt,
      last_attempted_sync: startedAt,
      error_message: null,
      updated_at: completedAt,
    };

    if (connection.provider === "meta" && "metaPermissionStatus" in result) {
      update.configuration = {
        ...(connection.configuration ?? {}),
        meta_permission_status: result.metaPermissionStatus,
        meta_granted_permissions: result.grantedPermissions,
        meta_missing_permissions: result.missingPermissions,
      };
    }

    await admin
      .from("reporting_integration_connections")
      .update(update)
      .eq("id", connection.id);

    return {
      companyId: connection.company_id,
      provider: connection.provider,
      status: "success" as const,
      recordsImported: result.recordsImported,
      changes: events.length,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Automated sync failed.";

    await Promise.all([
      admin
        .from("sync_logs")
        .update({ completed_at: completedAt, status: "error", error_message: message })
        .eq("id", log.id),
      admin
        .from("reporting_integration_connections")
        .update({
          status: "error",
          last_attempted_sync: startedAt,
          error_message: message,
          updated_at: completedAt,
        })
        .eq("id", connection.id),
    ]);

    throw error;
  }
}

async function dispatchSync(connection: ConnectionRow) {
  const configuration = (connection.configuration ?? {}) as ConnectionConfiguration;

  if (connection.provider === "robaws") {
    return syncRobawsProvider(connection.company_id);
  }
  if (connection.provider === "meta") {
    return syncMetaProvider(connection.id, connection.company_id, configuration);
  }
  if (isGoogleProvider(connection.provider)) {
    return syncGoogleProvider(
      connection.provider,
      connection.id,
      connection.company_id,
      configuration,
    );
  }
  if (connection.provider === "monday" || connection.provider === "hubspot") {
    return syncCrmProvider(
      connection.provider,
      connection.company_id,
      connection.configuration ?? {},
    );
  }

  throw new Error(`Automated sync is not implemented for ${connection.provider}.`);
}

async function snapshot(companyId: string): Promise<Snapshot> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("reporting_business_snapshot", {
    p_company_id: companyId,
  });

  if (error) throw new Error(`Unable to create reporting snapshot: ${error.message}`);
  const value = (data ?? {}) as Partial<Snapshot>;

  return {
    leads: Number(value.leads ?? 0),
    signed: Number(value.signed ?? 0),
    commercial_clients: Number(value.commercial_clients ?? 0),
    open_offers: Number(value.open_offers ?? 0),
    open_pipeline: Number(value.open_pipeline ?? 0),
    project_value: Number(value.project_value ?? 0),
    invoiced: Number(value.invoiced ?? 0),
    paid: Number(value.paid ?? 0),
    spend_ytd: Number(value.spend_ytd ?? 0),
  };
}

function changeEvents(
  connection: ConnectionRow,
  syncLogId: number | string,
  before: Snapshot,
  after: Snapshot,
  occurredAt: string,
) {
  const definitions: Array<{
    key: keyof Snapshot;
    label: string;
    money?: boolean;
    positiveTone?: "good" | "info";
  }> = [
    { key: "leads", label: "CRM leads", positiveTone: "info" },
    { key: "signed", label: "Signed clients", positiveTone: "good" },
    { key: "commercial_clients", label: "ROBAWS clients", positiveTone: "good" },
    { key: "open_offers", label: "Open offers", positiveTone: "info" },
    { key: "open_pipeline", label: "Open pipeline", money: true, positiveTone: "info" },
    { key: "project_value", label: "Project value", money: true, positiveTone: "good" },
    { key: "invoiced", label: "Invoiced", money: true, positiveTone: "good" },
    { key: "paid", label: "Paid cash", money: true, positiveTone: "good" },
    { key: "spend_ytd", label: "Tracked ad spend", money: true, positiveTone: "info" },
  ];

  return definitions.flatMap((definition) => {
    const previous = before[definition.key];
    const current = after[definition.key];
    const delta = current - previous;
    if (Math.abs(delta) < 0.005) return [];

    const direction = delta > 0 ? "+" : "";
    const formattedDelta = definition.money
      ? `${direction}€${Math.abs(delta).toLocaleString("en-BE", { maximumFractionDigits: 2 })}`
      : `${direction}${delta.toLocaleString("en-BE", { maximumFractionDigits: 0 })}`;

    return [{
      company_id: connection.company_id,
      provider: connection.provider,
      sync_log_id: syncLogId,
      occurred_at: occurredAt,
      metric_key: definition.key,
      title: `${formattedDelta} ${definition.label}`,
      detail: `${definition.label} changed from ${formatValue(previous, definition.money)} to ${formatValue(current, definition.money)} after ${connection.provider} sync.`,
      delta,
      before_value: previous,
      after_value: current,
      severity: delta < 0 && ["signed", "commercial_clients", "project_value", "invoiced", "paid"].includes(definition.key)
        ? "warn"
        : delta > 0
          ? (definition.positiveTone ?? "info")
          : "info",
      metadata: {
        trigger: "automation",
        provider: connection.provider,
      },
    }];
  });
}

function formatValue(value: number, money = false) {
  if (money) {
    return `€${value.toLocaleString("en-BE", { maximumFractionDigits: 2 })}`;
  }
  return value.toLocaleString("en-BE", { maximumFractionDigits: 0 });
}
