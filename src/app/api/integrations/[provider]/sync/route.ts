import { NextResponse } from "next/server";

import { requireIntegrationConnection } from "@/lib/integrations/access";
import { parseProvider, providerCatalog } from "@/lib/integrations/catalog";
import { syncCrmProvider } from "@/lib/integrations/crm-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const provider = parseProvider(
    (await params).provider,
  );

  if (!provider) {
    return NextResponse.json(
      { error: "Unknown integration provider." },
      { status: 404 },
    );
  }

  const body = await request
    .json()
    .catch(() => ({})) as {
      companyId?: string;
    };

  if (!body.companyId) {
    return NextResponse.json(
      { error: "companyId is required." },
      { status: 400 },
    );
  }

  const access = await requireIntegrationConnection(
    body.companyId,
    provider,
  );

  if ("error" in access) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  if (access.connection.status !== "connected") {
    return NextResponse.json(
      {
        error:
          `${providerCatalog[provider].name} is not connected.`,
      },
      { status: 409 },
    );
  }

  if (provider !== "monday" && provider !== "hubspot") {
    return NextResponse.json(
      {
        error:
          `${providerCatalog[provider].name} data sync is not implemented yet.`,
      },
      { status: 503 },
    );
  }

  const admin = createSupabaseAdminClient();
  const startedAt = new Date().toISOString();

  const logResult = await admin
    .from("sync_logs")
    .insert({
      integration_connection_id:
        access.connection.id,
      started_at: startedAt,
      status: "running",
      records_imported: 0,
      metadata: {
        trigger: "manual",
        provider,
      },
    })
    .select("id")
    .single();

  if (logResult.error) {
    return NextResponse.json(
      { error: logResult.error.message },
      { status: 500 },
    );
  }

  await admin
    .from("reporting_integration_connections")
    .update({
      last_attempted_sync: startedAt,
      error_message: null,
      updated_at: startedAt,
    })
    .eq("id", access.connection.id);

  try {
    const result = await syncCrmProvider(
      provider,
      body.companyId,
      access.connection.configuration as Record<
        string,
        unknown
      >,
    );

    const completedAt = new Date().toISOString();

    await admin
      .from("reporting_integration_connections")
      .update({
        status: "connected",
        last_successful_sync: completedAt,
        last_attempted_sync: startedAt,
        error_message: null,
        updated_at: completedAt,
      })
      .eq("id", access.connection.id);

    await admin
      .from("sync_logs")
      .update({
        completed_at: completedAt,
        status: "success",
        records_imported:
          result.recordsImported,
        error_message: null,
        metadata: {
          trigger: "manual",
          provider,
          leadsImported:
            result.leadsImported,
          projectsImported:
            result.projectsImported,
          revenueImported:
            result.revenueImported,
        },
      })
      .eq("id", logResult.data.id);

    return NextResponse.json({
      message:
        `${providerCatalog[provider].name}: ` +
        `${result.leadsImported} leads, ` +
        `${result.projectsImported} projects and ` +
        `${result.revenueImported} revenue records synced.`,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "CRM sync failed.";

    const completedAt = new Date().toISOString();

    await admin
      .from("reporting_integration_connections")
      .update({
        status: "error",
        last_attempted_sync: startedAt,
        error_message: message,
        updated_at: completedAt,
      })
      .eq("id", access.connection.id);

    await admin
      .from("sync_logs")
      .update({
        completed_at: completedAt,
        status: "error",
        error_message: message,
      })
      .eq("id", logResult.data.id);

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
