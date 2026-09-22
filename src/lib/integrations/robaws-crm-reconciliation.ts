import "server-only";

import { syncCrmProvider } from "@/lib/integrations/crm-sync";
import { syncRobawsProvider, type RobawsSyncResult } from "@/lib/integrations/robaws-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type MondayConfiguration = {
  board_id?: string;
};

type ReconciliationResult = {
  evaluated: number;
  existingUpdated: number;
  createdInCrm: number;
  skippedWithoutExternalId: number;
  crmRefreshed: boolean;
  robawsRefreshed: boolean;
};

type CommercialClientRow = {
  id: string;
  external_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  client_since: string | null;
  matched_lead_id: string | null;
  invoice_count: number | string;
  invoiced_total: number | string;
};

type LeadRow = {
  id: string;
  crm_external_id: string | null;
  crm_status: string | null;
  notes: string | null;
};

type OverrideRow = {
  scope_key: string;
  value: unknown;
};

const DEFAULT_BOARD_ID = "5094302330";
const SIGNED_GROUP_ID = "group_mm27yy80";

export async function syncRobawsWithCrmReconciliation(
  companyId: string,
): Promise<RobawsSyncResult & { crmReconciliation: ReconciliationResult }> {
  const first = await syncRobawsProvider(companyId);
  const admin = createSupabaseAdminClient();

  const mondayResult = await admin
    .from("reporting_integration_connections")
    .select("configuration,status")
    .eq("company_id", companyId)
    .eq("provider", "monday")
    .maybeSingle();

  if (mondayResult.error) {
    throw new Error(`Unable to load Monday connection for ROBAWS reconciliation: ${mondayResult.error.message}`);
  }

  if (!mondayResult.data || mondayResult.data.status !== "connected") {
    return {
      ...first,
      crmReconciliation: {
        evaluated: 0,
        existingUpdated: 0,
        createdInCrm: 0,
        skippedWithoutExternalId: 0,
        crmRefreshed: false,
        robawsRefreshed: false,
      },
    };
  }

  const configuration = (mondayResult.data.configuration ?? {}) as MondayConfiguration;
  const reconciliation = await reconcileInvoicedRobawsClientsToMonday(
    companyId,
    configuration,
  );

  if (!reconciliation.existingUpdated && !reconciliation.createdInCrm) {
    return { ...first, crmReconciliation: reconciliation };
  }

  await syncCrmProvider("monday", companyId, configuration as Record<string, unknown>);
  const finalRobaws = await syncRobawsProvider(companyId);

  return {
    ...finalRobaws,
    crmReconciliation: {
      ...reconciliation,
      crmRefreshed: true,
      robawsRefreshed: true,
    },
  };
}

export async function reconcileInvoicedRobawsClientsToMonday(
  companyId: string,
  configuration: MondayConfiguration,
): Promise<ReconciliationResult> {
  const admin = createSupabaseAdminClient();
  const boardId = configuration.board_id || DEFAULT_BOARD_ID;

  const [clientsResult, leadsResult, overridesResult] = await Promise.all([
    admin
      .from("commercial_clients")
      .select("id,external_id,name,email,phone,client_since,matched_lead_id,invoice_count,invoiced_total")
      .eq("company_id", companyId)
      .gt("invoice_count", 0)
      .gt("invoiced_total", 0),
    admin
      .from("leads")
      .select("id,crm_external_id,crm_status,notes")
      .eq("company_id", companyId)
      .eq("crm_source", "monday"),
    admin
      .from("reporting_overrides")
      .select("scope_key,value")
      .eq("company_id", companyId)
      .eq("scope_type", "client")
      .eq("field_key", "source")
      .like("scope_key", "robaws:%"),
  ]);

  const error = [clientsResult, leadsResult, overridesResult].find(result => result.error)?.error;
  if (error) {
    throw new Error(`Unable to prepare ROBAWS → CRM reconciliation: ${error.message}`);
  }

  const clients = (clientsResult.data ?? []) as CommercialClientRow[];
  const leads = (leadsResult.data ?? []) as LeadRow[];
  const overrides = (overridesResult.data ?? []) as OverrideRow[];
  const leadById = new Map(leads.map(lead => [lead.id, lead]));
  const leadByRobawsMarker = new Map<string, LeadRow>();

  for (const lead of leads) {
    const marker = robawsClientIdFromNotes(lead.notes);
    if (marker) leadByRobawsMarker.set(marker, lead);
  }

  const sourceByRobawsId = new Map(
    overrides.map(row => [
      row.scope_key.replace(/^robaws:/, ""),
      typeof row.value === "string" ? row.value : String(row.value ?? ""),
    ]),
  );

  const token = required("MONDAY_API_TOKEN");
  let existingUpdated = 0;
  let createdInCrm = 0;
  let skippedWithoutExternalId = 0;

  for (const client of clients) {
    const existing =
      (client.matched_lead_id ? leadById.get(client.matched_lead_id) : undefined)
      ?? leadByRobawsMarker.get(client.external_id);

    if (existing) {
      if (!existing.crm_external_id) {
        skippedWithoutExternalId += 1;
        continue;
      }

      if (normalize(existing.crm_status) !== "signed") {
        await updateMondayStatus(token, boardId, existing.crm_external_id);
        existingUpdated += 1;
      }

      continue;
    }

    await createSignedMondayItem(token, boardId, client, sourceByRobawsId.get(client.external_id));
    createdInCrm += 1;
  }

  return {
    evaluated: clients.length,
    existingUpdated,
    createdInCrm,
    skippedWithoutExternalId,
    crmRefreshed: false,
    robawsRefreshed: false,
  };
}

async function updateMondayStatus(
  token: string,
  boardId: string,
  itemId: string,
) {
  const mutation = `
    mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(
        board_id: $boardId,
        item_id: $itemId,
        column_values: $columnValues
      ) {
        id
      }
    }
  `;

  await mondayRequest(token, mutation, {
    boardId,
    itemId,
    columnValues: JSON.stringify({
      lead_status: { label: "signed" },
    }),
  });
}

async function createSignedMondayItem(
  token: string,
  boardId: string,
  client: CommercialClientRow,
  confirmedSource?: string,
) {
  const values: Record<string, unknown> = {
    lead_status: { label: "signed" },
    text_mm27ak9k:
      `Automatically transferred from ROBAWS because an invoice exists. ROBAWS client #${client.external_id}. Source is left unassigned unless confirmed.`,
  };

  if (client.email) {
    values.lead_email = {
      email: client.email.trim(),
      text: client.email.trim(),
    };
  }

  const phone = mondayPhone(client.phone);
  if (phone) values.lead_phone = phone;

  if (client.client_since) {
    values.date_mm2ez375 = {
      date: client.client_since.slice(0, 10),
    };
  }

  const sourceLabel = mondaySourceLabel(confirmedSource);
  if (sourceLabel) {
    values.color_mkyb8krc = { label: sourceLabel };
  }

  const mutation = `
    mutation (
      $boardId: ID!,
      $groupId: String!,
      $itemName: String!,
      $columnValues: JSON!
    ) {
      create_item(
        board_id: $boardId,
        group_id: $groupId,
        item_name: $itemName,
        column_values: $columnValues
      ) {
        id
      }
    }
  `;

  await mondayRequest(token, mutation, {
    boardId,
    groupId: SIGNED_GROUP_ID,
    itemName: client.name.slice(0, 255),
    columnValues: JSON.stringify(values),
  });
}

async function mondayRequest(
  token: string,
  query: string,
  variables: Record<string, unknown>,
) {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      "API-Version": "2026-07",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const json = await response.json() as {
    data?: unknown;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || json.errors?.length || !json.data) {
    throw new Error(
      json.errors?.map(error => error.message).join("; ")
      || `Monday API returned HTTP ${response.status} during ROBAWS reconciliation.`,
    );
  }

  return json.data;
}

function robawsClientIdFromNotes(notes: string | null) {
  const match = notes?.match(/ROBAWS client #(\d+)/i);
  return match?.[1] ?? null;
}

function mondayPhone(value: string | null) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("320")) digits = "32" + digits.slice(3);
  if (digits.startsWith("0")) digits = "32" + digits.slice(1);
  if (digits.startsWith("4") && digits.length === 9) digits = "32" + digits;

  return {
    phone: `+${digits}`,
    countryShortName: "BE",
  };
}

function mondaySourceLabel(value: string | undefined) {
  const key = normalize(value);
  if (!key) return null;
  if (key === "google ads") return "Google ads";
  if (["facebook ads", "meta ads", "facebook", "instagram"].includes(key)) return "Facebook ads";
  if (key === "leadangel") return "LeadAngel";
  if (key === "agenciyou") return "AgenciYou";
  if (key === "web") return "Web";
  if (key === "web calculator") return "web calculator";
  if (key === "email") return "Email";
  if (key === "linkedin") return "LinkedIn";
  if (key === "solvari") return "Solvari";
  if (key === "tik tok" || key === "tiktok") return "Tik tok";
  if (key === "monday form") return "monday Form";
  return null;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
