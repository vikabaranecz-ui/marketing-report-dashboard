import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchAllRobaws } from "@/lib/integrations/robaws-client";

type LeadRow = {
  id: string;
  name: string;
  created_at: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  service_id: string | null;
  channel_id: string | null;
  campaign_id: string | null;
};

type RobawsClient = {
  id: string;
  name?: string | null;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  invoiceEmail?: string | null;
  tel?: string | null;
  gsm?: string | null;
  contacts?: unknown;
  clientSince?: string | null;
};

type RobawsOffer = {
  id: string;
  logicId?: string | null;
  date?: string | null;
  sentDate?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  totalInclVat?: number | null;
  totalExclVat?: number | null;
  status?: string | null;
};

type RobawsProject = {
  id: string;
  date?: string | null;
  clientId?: string | null;
  planningName?: string | null;
  status?: string | null;
};

type RobawsInvoice = {
  id: string;
  logicId?: string | null;
  date?: string | null;
  clientId?: string | null;
  status?: string | null;
  type?: string | null;
  originType?: string | null;
  documentId?: string | null;
  totalInclVat?: number | null;
  totalExclVat?: number | null;
  paidTotal?: number | null;
  creditedTotal?: number | null;
};

export type RobawsSyncResult = {
  recordsImported: number;
  leadsImported: number;
  leadsMatched: number;
  dealsImported: number;
  quotesImported: number;
  projectsImported: number;
  invoicesImported: number;
  revenueImported: number;
};

const ACCEPTED = new Set([
  "goedgekeurd",
  "gefactureerd",
  "deelfactuur",
]);

const REJECTED = new Set([
  "afgekeurd",
]);

export async function syncRobawsProvider(
  companyId: string,
): Promise<RobawsSyncResult> {
  const admin = createSupabaseAdminClient();

  const [clients, offers, projects, invoices, leadsResult] =
    await Promise.all([
      fetchAllRobaws<RobawsClient>("clients", {
        include: "contacts",
      }),
      fetchAllRobaws<RobawsOffer>("offers"),
      fetchAllRobaws<RobawsProject>("projects"),
      fetchAllRobaws<RobawsInvoice>("sales-invoices"),
      admin
        .from("leads")
        .select(
          "id,name,created_at,email,phone,source,service_id,channel_id,campaign_id",
        )
        .eq("company_id", companyId)
        .eq("crm_source", "monday"),
    ]);

  if (leadsResult.error) {
    throw new Error(leadsResult.error.message);
  }

  const leads = (leadsResult.data ?? []) as LeadRow[];

  const emailMap = new Map<string, Set<string>>();
  const phoneMap = new Map<string, Set<string>>();
  const nameMap = new Map<string, Set<string>>();

  for (const client of clients) {
    const emails = new Set<string>();
    const phones = new Set<string>();
    const names = new Set<string>();

    for (const value of [
      client.name,
      client.companyName,
      [client.firstName, client.lastName].filter(Boolean).join(" "),
    ]) {
      const normalized = normalizeName(value);
      if (normalized) names.add(normalized);
    }

    for (const value of [
      client.email,
      client.invoiceEmail,
    ]) {
      const normalized = normalizeEmail(value);
      if (normalized) emails.add(normalized);
    }

    for (const value of [
      client.tel,
      client.gsm,
    ]) {
      const normalized = normalizePhone(value);
      if (normalized) phones.add(normalized);
    }

    collectContactIdentifiers(
      client.contacts,
      emails,
      phones,
    );
    collectContactNames(client.contacts, names);

    for (const value of emails) {
      addIndex(emailMap, value, client.id);
    }

    for (const value of phones) {
      addIndex(phoneMap, value, client.id);
    }

    for (const value of names) {
      addIndex(nameMap, value, client.id);
    }
  }

  const candidates = leads.map((lead) => ({
    lead,
    ...matchClient(
      lead,
      emailMap,
      phoneMap,
      nameMap,
    ),
  }));

  const leadsByClient = new Map<string, LeadRow[]>();

  for (const candidate of candidates) {
    if (!candidate.clientId) continue;

    const existing =
      leadsByClient.get(candidate.clientId) ?? [];

    existing.push(candidate.lead);
    leadsByClient.set(
      candidate.clientId,
      existing,
    );
  }

  const offersByClient =
    indexByClient(offers);

  const projectsByClient =
    indexByClient(projects);

  const invoicesByClient =
    indexByClient(invoices);

  const leadIds = leads.map((lead) => lead.id);

  if (leadIds.length) {
    const cleanupResults = await Promise.all([
      admin
        .from("quotes")
        .delete()
        .eq("external_source", "robaws")
        .in("lead_id", leadIds),

      admin
        .from("projects")
        .delete()
        .eq("crm_source", "robaws")
        .in("lead_id", leadIds),

      admin
        .from("commercial_invoices")
        .delete()
        .eq("company_id", companyId)
        .eq("external_source", "robaws"),
    ]);

    const cleanupError = cleanupResults.find(result => result.error)?.error;

    if (cleanupError) {
      throw new Error(`ROBAWS cleanup: ${cleanupError.message}`);
    }
  }

  const resetResult = await admin
    .from("leads")
    .update({
      robaws_client_id: null,
      robaws_match_method: null,
      commercial_status: null,
      commercial_attribution_status: null,
    })
    .eq("company_id", companyId)
    .eq("crm_source", "monday");

  if (resetResult.error) {
    throw new Error(`ROBAWS lead reset: ${resetResult.error.message}`);
  }

  const quoteRows: Record<string, unknown>[] = [];
  const projectRows: Record<string, unknown>[] = [];
  const invoiceRows: Record<string, unknown>[] = [];
  const updates: Array<{
    id: string;
    values: Record<string, unknown>;
  }> = [];

  for (const candidate of candidates) {
    const { lead } = candidate;

    if (
      candidate.method === "AMBIGUOUS" ||
      !candidate.clientId
    ) {
      if (candidate.method === "AMBIGUOUS") {
        updates.push({
          id: lead.id,
          values: {
            robaws_match_method: "AMBIGUOUS",
            commercial_attribution_status:
              "AMBIGUOUS",
          },
        });
      }

      continue;
    }

    const clientId = candidate.clientId;

    if (
      (leadsByClient.get(clientId)?.length ?? 0) > 1
    ) {
      updates.push({
        id: lead.id,
        values: {
          robaws_match_method: "AMBIGUOUS",
          commercial_attribution_status:
            "MULTIPLE_LEADS_SAME_CLIENT",
        },
      });

      continue;
    }

    const clientOffers =
      offersByClient.get(clientId) ?? [];

    const clientProjects =
      projectsByClient.get(clientId) ?? [];

    const clientInvoices =
      invoicesByClient.get(clientId) ?? [];

    const acceptedOffers =
      clientOffers.filter(isAccepted);

    const openOffers =
      clientOffers.filter(
        offer =>
          !isAccepted(offer) &&
          !isRejected(offer),
      );

    const hasInvoice =
      clientInvoices.some(
        invoice =>
          normalize(invoice.status) !==
            "gecrediteerd" &&
          Number(invoice.totalInclVat ?? 0) > 0,
      );

    const isClient =
      acceptedOffers.length > 0 ||
      clientProjects.length > 0 ||
      hasInvoice;

    const commercialStatus =
      isClient
        ? "CLIENT_WON"
        : openOffers.length
          ? "OFFER_SENT"
          : clientOffers.length
            ? "OFFER_LOST"
            : "ROBAWS_CONTACT";

    const hasDateConflict =
      acceptedOffers.some(
        offer =>
          documentAttribution(
            offer.date,
            lead.created_at,
          ) === "DATE_CONFLICT",
      );

    updates.push({
      id: lead.id,
      values: {
        robaws_client_id: clientId,
        robaws_match_method:
          candidate.method,
        commercial_status:
          commercialStatus,
        commercial_attribution_status:
          hasDateConflict
            ? "REVIEW_DATE_CONFLICT"
            : "VERIFIED",
      },
    });

    for (const offer of clientOffers) {
      quoteRows.push({
        lead_id: lead.id,
        quote_number:
          offer.logicId ||
          `ROB-${offer.id}`,
        quote_value:
          Number(offer.totalExclVat ?? 0),
        quote_value_incl_vat:
          Number(offer.totalInclVat ?? 0),
        created_at:
          toTimestamp(offer.date),
        sent_at:
          toTimestamp(offer.sentDate),
        status:
          offer.status || "unknown",
        accepted_at: null,
        external_source: "robaws",
        external_id: offer.id,
        external_client_id: clientId,
        project_external_id:
          offer.projectId || null,
        attribution_status:
          documentAttribution(
            offer.date,
            lead.created_at,
          ),
      });
    }

    for (const project of clientProjects) {
      const linkedAccepted =
        clientOffers.filter(
          offer =>
            offer.projectId === project.id &&
            isAccepted(offer),
        );

      const valueIncl =
        linkedAccepted.reduce(
          (sum, offer) =>
            sum +
            Number(offer.totalInclVat ?? 0),
          0,
        );

      const valueExcl =
        linkedAccepted.reduce(
          (sum, offer) =>
            sum +
            Number(offer.totalExclVat ?? 0),
          0,
        );

      const projectAttribution =
        linkedAccepted.length
          ? linkedAccepted.some(
              offer =>
                documentAttribution(
                  offer.date,
                  lead.created_at,
                ) === "DATE_CONFLICT",
            )
            ? "DATE_CONFLICT"
            : "EXACT_AFTER_LEAD"
          : documentAttribution(
              project.date,
              lead.created_at,
            );

      projectRows.push({
        lead_id: lead.id,
        service_id: lead.service_id,
        project_value:
          valueIncl || null,
        project_value_excl_vat:
          valueExcl || null,
        gross_margin: null,
        status: "won",
        won_at:
          toTimestamp(
            linkedAccepted[0]?.date ||
            project.date,
          ),
        completed_at: null,
        crm_source: "robaws",
        crm_external_id: project.id,
        external_client_id: clientId,
        external_status:
          project.status || null,
        attribution_status:
          projectAttribution,
      });
    }

    for (const invoice of clientInvoices) {
      invoiceRows.push({
        company_id: companyId,
        lead_id: lead.id,
        external_source: "robaws",
        external_id: invoice.id,
        external_client_id: clientId,
        invoice_number:
          invoice.logicId ||
          `ROB-${invoice.id}`,
        invoice_date:
          invoice.date || null,
        status:
          invoice.status || null,
        invoice_type:
          invoice.type || null,
        origin_type:
          invoice.originType || null,
        document_id:
          invoice.documentId || null,
        total_excl_vat:
          Number(
            invoice.totalExclVat ?? 0,
          ),
        total_incl_vat:
          Number(
            invoice.totalInclVat ?? 0,
          ),
        paid_total:
          Number(
            invoice.paidTotal ?? 0,
          ),
        credited_total:
          Number(
            invoice.creditedTotal ?? 0,
          ),
        attribution_status:
          documentAttribution(
            invoice.date,
            lead.created_at,
          ),
        updated_at:
          new Date().toISOString(),
      });
    }
  }

  for (
    let offset = 0;
    offset < updates.length;
    offset += 20
  ) {
    const batch =
      updates.slice(offset, offset + 20);

    await Promise.all(
      batch.map(async item => {
        const result = await admin
          .from("leads")
          .update(item.values)
          .eq("id", item.id);

        if (result.error) {
          throw new Error(
            result.error.message,
          );
        }
      }),
    );
  }

  if (quoteRows.length) {
    const result = await admin
      .from("quotes")
      .upsert(quoteRows, {
        onConflict:
          "external_source,external_id",
      });

    if (result.error) {
      throw new Error(
        `ROBAWS offers: ${result.error.message}`,
      );
    }
  }

  if (projectRows.length) {
    const result = await admin
      .from("projects")
      .upsert(projectRows, {
        onConflict:
          "lead_id,crm_source,crm_external_id",
      });

    if (result.error) {
      throw new Error(
        `ROBAWS projects: ${result.error.message}`,
      );
    }
  }

  if (invoiceRows.length) {
    const result = await admin
      .from("commercial_invoices")
      .upsert(invoiceRows, {
        onConflict:
          "external_source,external_id",
      });

    if (result.error) {
      throw new Error(
        `ROBAWS invoices: ${result.error.message}`,
      );
    }
  }

  return {
    recordsImported:
      quoteRows.length +
      projectRows.length +
      invoiceRows.length,
    leadsImported:
      updates.length,
    leadsMatched:
      updates.filter(item => typeof item.values.robaws_client_id === "string").length,
    dealsImported: 0,
    quotesImported:
      quoteRows.length,
    projectsImported:
      projectRows.length,
    invoicesImported:
      invoiceRows.length,
    revenueImported:
      invoiceRows.filter(
        row =>
          row.attribution_status ===
            "EXACT_AFTER_LEAD" &&
          Number(row.paid_total ?? 0) > 0,
      ).length,
  };
}

function matchClient(
  lead: LeadRow,
  emailMap: Map<string, Set<string>>,
  phoneMap: Map<string, Set<string>>,
  nameMap: Map<string, Set<string>>,
) {
  const emailIds =
    emailMap.get(
      normalizeEmail(lead.email),
    ) ?? new Set<string>();

  const phoneIds =
    phoneMap.get(
      normalizePhone(lead.phone),
    ) ?? new Set<string>();

  if (
    emailIds.size &&
    phoneIds.size
  ) {
    const intersection =
      [...emailIds].filter(
        id => phoneIds.has(id),
      );

    if (intersection.length === 1) {
      return {
        clientId: intersection[0],
        method: "EMAIL+PHONE",
      };
    }

    return {
      clientId: null,
      method: "AMBIGUOUS",
    };
  }

  if (emailIds.size === 1) {
    return {
      clientId: [...emailIds][0],
      method: "EMAIL",
    };
  }

  if (phoneIds.size === 1) {
    return {
      clientId: [...phoneIds][0],
      method: "PHONE",
    };
  }

  if (
    emailIds.size > 1 ||
    phoneIds.size > 1
  ) {
    return {
      clientId: null,
      method: "AMBIGUOUS",
    };
  }

  const normalizedName = normalizeName(lead.name);
  if (normalizedName) {
    const nameIds = nameMap.get(normalizedName) ?? new Set<string>();
    if (nameIds.size === 1) {
      return {
        clientId: [...nameIds][0],
        method: "NAME",
      };
    }
    if (nameIds.size > 1) {
      return {
        clientId: null,
        method: "AMBIGUOUS",
      };
    }
  }

  return {
    clientId: null,
    method: "NONE",
  };
}

function collectContactIdentifiers(
  value: unknown,
  emails: Set<string>,
  phones: Set<string>,
  depth = 0,
) {
  if (!value || depth > 4) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectContactIdentifiers(
        item,
        emails,
        phones,
        depth + 1,
      );
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  for (
    const [key, child]
    of Object.entries(
      value as Record<string, unknown>,
    )
  ) {
    const normalizedKey =
      key.toLowerCase();

    if (
      normalizedKey === "email" ||
      normalizedKey === "invoiceemail"
    ) {
      const normalized =
        normalizeEmail(child);

      if (normalized) {
        emails.add(normalized);
      }
    }

    if (
      [
        "tel",
        "gsm",
        "phone",
        "telephone",
      ].includes(normalizedKey)
    ) {
      const normalized =
        normalizePhone(child);

      if (normalized) {
        phones.add(normalized);
      }
    }

    if (
      child &&
      typeof child === "object"
    ) {
      collectContactIdentifiers(
        child,
        emails,
        phones,
        depth + 1,
      );
    }
  }
}

function collectContactNames(
  value: unknown,
  names: Set<string>,
  depth = 0,
) {
  if (!value || depth > 4) return;

  if (Array.isArray(value)) {
    for (const item of value) collectContactNames(item, names, depth + 1);
    return;
  }

  if (typeof value !== "object") return;

  const row = value as Record<string, unknown>;
  const direct = [
    row.name,
    row.fullName,
    row.companyName,
    [row.firstName, row.lastName].filter(Boolean).join(" "),
  ];

  for (const candidate of direct) {
    const normalized = normalizeName(candidate);
    if (normalized) names.add(normalized);
  }

  for (const child of Object.values(row)) {
    if (child && typeof child === "object") collectContactNames(child, names, depth + 1);
  }
}

function normalizeName(value: unknown) {
  const text = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  const tokens = text.split(" ").filter(Boolean);
  if (tokens.length < 2 || text.length < 6) return "";
  return text;
}

function addIndex(
  map: Map<string, Set<string>>,
  key: string,
  id: string,
) {
  const values =
    map.get(key) ?? new Set<string>();

  values.add(id);
  map.set(key, values);
}

function indexByClient<
  T extends { clientId?: string | null }
>(rows: T[]) {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    if (!row.clientId) continue;

    const current =
      map.get(row.clientId) ?? [];

    current.push(row);
    map.set(
      row.clientId,
      current,
    );
  }

  return map;
}

function normalizeEmail(
  value: unknown,
) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizePhone(
  value: unknown,
) {
  let digits =
    String(value ?? "")
      .replace(/\D/g, "");

  if (!digits) return "";

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("320")) {
    digits =
      "32" + digits.slice(3);
  }

  if (
    digits.startsWith("04") &&
    digits.length === 10
  ) {
    digits =
      "32" + digits.slice(1);
  }

  if (
    digits.startsWith("4") &&
    digits.length === 9
  ) {
    digits =
      "32" + digits;
  }

  return digits;
}

function normalize(
  value: unknown,
) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isAccepted(
  offer: RobawsOffer,
) {
  return ACCEPTED.has(
    normalize(offer.status),
  );
}

function isRejected(
  offer: RobawsOffer,
) {
  return REJECTED.has(
    normalize(offer.status),
  );
}

function documentAttribution(
  documentDate: string | null | undefined,
  leadDate: string,
) {
  if (!documentDate) {
    return "DATE_UNKNOWN";
  }

  return documentDate.slice(0, 10) >=
    leadDate.slice(0, 10)
      ? "EXACT_AFTER_LEAD"
      : "DATE_CONFLICT";
}

function toTimestamp(
  value: string | null | undefined,
) {
  if (!value) return null;

  return value.includes("T")
    ? value
    : `${value}T00:00:00.000Z`;
}
