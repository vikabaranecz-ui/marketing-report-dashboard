import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { IntegrationProvider } from "./types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type SyncResult = {
  recordsImported: number;
  leadsImported: number;
  projectsImported: number;
  revenueImported: number;
};

type LookupMaps = {
  channels: Map<string, string>;
  services: Map<string, string>;
};

type ImportedLeadRow = {
  id: string;
  crm_external_id: string | null;
  channel_id: string | null;
  service_id: string | null;
};

type MondayColumn = {
  id: string;
  text?: string | null;
  value?: string | null;
};

type MondayItem = {
  id: string;
  name: string;
  created_at: string;
  column_values: MondayColumn[];
};

type MondayPage = {
  cursor?: string | null;
  items: MondayItem[];
};

type HubSpotAssociation = {
  id: string;
  type?: string;
};

type HubSpotAssociations = {
  results?: HubSpotAssociation[];
};

type HubSpotContact = {
  id: string;
  properties: Record<string, string | null | undefined>;
  associations?: {
    deals?: HubSpotAssociations;
  };
};

type HubSpotDeal = {
  id: string;
  properties: Record<string, string | null | undefined>;
  associations?: {
    contacts?: HubSpotAssociations;
  };
};

type HubSpotPage<T> = {
  results?: T[];
  paging?: {
    next?: {
      after?: string;
    };
  };
};

export async function syncCrmProvider(
  provider: IntegrationProvider,
  companyId: string,
  configuration: Record<string, unknown>,
): Promise<SyncResult> {
  const admin = createSupabaseAdminClient();
  const lookups = await loadLookups(admin, companyId);

  if (provider === "monday") {
    return syncMonday(admin, companyId, configuration, lookups);
  }

  if (provider === "hubspot") {
    return syncHubSpot(admin, companyId, lookups);
  }

  throw new Error(`${provider} CRM sync is not implemented yet.`);
}

async function loadLookups(
  admin: AdminClient,
  companyId: string,
): Promise<LookupMaps> {
  const [channelsResult, servicesResult] = await Promise.all([
    admin
      .from("marketing_channels")
      .select("id,name"),
    admin
      .from("services")
      .select("id,name")
      .eq("company_id", companyId)
      .eq("is_active", true),
  ]);

  if (channelsResult.error) {
    throw new Error(channelsResult.error.message);
  }

  if (servicesResult.error) {
    throw new Error(servicesResult.error.message);
  }

  return {
    channels: new Map(
      (channelsResult.data ?? []).map((row) => [
        normalize(String(row.name)),
        String(row.id),
      ]),
    ),
    services: new Map(
      (servicesResult.data ?? []).map((row) => [
        normalize(String(row.name)),
        String(row.id),
      ]),
    ),
  };
}

// =========================================================
// MONDAY / ISOPROTECH
// =========================================================

async function syncMonday(
  admin: AdminClient,
  companyId: string,
  configuration: Record<string, unknown>,
  lookups: LookupMaps,
): Promise<SyncResult> {
  const token = required("MONDAY_API_TOKEN");

  const boardId =
    typeof configuration.board_id === "string"
      ? configuration.board_id
      : "5094302330";

  const items = await fetchAllMondayItems(token, boardId);

  const leads = items.map((item) => {
    const columns = new Map(
      item.column_values.map((column) => [
        column.id,
        column.text ?? column.value ?? "",
      ]),
    );

    const rawLocation = clean(columns.get("text_mm27fswx"));
    const rawService = clean(columns.get("dropdown_mm27rsb6"));
    const rawSource = clean(columns.get("color_mkyb8krc"));
    const rawStatus = clean(columns.get("lead_status"));
    const leadDate = clean(columns.get("date_mm2ez375"));
    const nextAction = clean(columns.get("date__1"));
    const address = clean(columns.get("text_mm27ymsf"));
    const rawNotes = clean(columns.get("text_mm27ak9k"));
    const rejection = clean(columns.get("dropdown_mm576cvm"));

    const stage = mondayStage(rawStatus, rejection);

    const notes = [
      rawNotes,
      address ? `Address: ${address}` : "",
      nextAction ? `Next action: ${nextAction}` : "",
    ].filter(Boolean).join("\n");

    return {
      company_id: companyId,
      created_at: crmDate(leadDate, item.created_at),
      name: item.name || "Unknown",
      email: clean(columns.get("lead_email")) || null,
      phone: clean(columns.get("lead_phone")) || null,
      source: rawSource || null,
      channel_id: channelForMonday(rawSource, lookups.channels),
      service_id: serviceForIsoprotech(rawService, lookups.services),
      municipality:
        rawLocation && !looksLikePostalCode(rawLocation)
          ? rawLocation
          : null,
      postal_code:
        rawLocation && looksLikePostalCode(rawLocation)
          ? rawLocation
          : null,
      sales_stage: stage,
      crm_status: rawStatus || null,
      notes: notes || null,
      closed_at:
        stage === "won" || stage === "lost"
          ? new Date().toISOString()
          : null,
      lost_reason: stage === "lost" ? rejection || rawStatus || null : null,
      crm_source: "monday",
      crm_external_id: item.id,
    };
  });

  const imported = await upsertLeads(admin, leads);

  return {
    recordsImported: imported.length,
    leadsImported: imported.length,
    projectsImported: 0,
    revenueImported: 0,
  };
}

async function fetchAllMondayItems(
  token: string,
  boardId: string,
): Promise<MondayItem[]> {
  const all: MondayItem[] = [];

  const firstQuery = `
    query ($ids: [ID!]!) {
      boards(ids: $ids) {
        items_page(limit: 100) {
          cursor
          items {
            id
            name
            created_at
            column_values {
              id
              text
              value
            }
          }
        }
      }
    }
  `;

  const first = await mondayRequest<{
    boards?: Array<{ items_page?: MondayPage }>;
  }>(token, firstQuery, { ids: [boardId] });

  const firstPage = first.boards?.[0]?.items_page;

  if (!firstPage) {
    throw new Error(`Monday board ${boardId} returned no items_page.`);
  }

  all.push(...firstPage.items);

  let cursor = firstPage.cursor ?? null;

  while (cursor) {
    const nextQuery = `
      query ($cursor: String!) {
        next_items_page(limit: 100, cursor: $cursor) {
          cursor
          items {
            id
            name
            created_at
            column_values {
              id
              text
              value
            }
          }
        }
      }
    `;

    const next = await mondayRequest<{
      next_items_page?: MondayPage;
    }>(token, nextQuery, { cursor });

    const page = next.next_items_page;

    if (!page) break;

    all.push(...page.items);
    cursor = page.cursor ?? null;
  }

  return all;
}

async function mondayRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
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
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || json.errors?.length || !json.data) {
    throw new Error(
      json.errors?.map((error) => error.message).join("; ") ||
      `Monday API returned HTTP ${response.status}.`,
    );
  }

  return json.data;
}

// =========================================================
// HUBSPOT / RENO RANGERS
// =========================================================

async function syncHubSpot(
  admin: AdminClient,
  companyId: string,
  lookups: LookupMaps,
): Promise<SyncResult> {
  const token = required("HUBSPOT_ACCESS_TOKEN");

  const [contacts, deals] = await Promise.all([
    fetchAllHubSpotContacts(token),
    fetchAllHubSpotDeals(token),
  ]);

  const dealsByContact = new Map<string, HubSpotDeal[]>();

  for (const deal of deals) {
    if (isSampleDeal(deal)) continue;

    for (const association of deal.associations?.contacts?.results ?? []) {
      const existing = dealsByContact.get(association.id) ?? [];
      existing.push(deal);
      dealsByContact.set(association.id, existing);
    }
  }

  const leads = contacts.map((contact) => {
    const properties = contact.properties;
    const contactDeals =
      (dealsByContact.get(contact.id) ?? [])
        .sort(compareDeals);

    const deal = contactDeals[0];
    const stage = hubSpotStage(properties, deal);

    const sourceCode = clean(properties.hs_analytics_source);
    const sourceDetail =
      clean(properties.hs_analytics_source_data_1) ||
      clean(properties.hs_latest_source_data_1);

    const rawService =
      clean(properties.wat_wilt_u_laten_renoveren) ||
      clean(properties.preferred_renovation_type);

    const postcode =
      clean(properties.postcode) ||
      clean(properties.zip);

    const name = [
      clean(properties.firstname),
      clean(properties.lastname),
    ].filter(Boolean).join(" ") || clean(properties.email) || "Unknown";

    const notes = [
      clean(properties.wanneer_wilt_u_starten)
        ? `Wanneer wilt u starten: ${clean(properties.wanneer_wilt_u_starten)}`
        : "",
      clean(properties.lead_question)
        ? `Lead question: ${clean(properties.lead_question)}`
        : "",
      rawService
        ? `Requested renovation: ${rawService}`
        : "",
    ].filter(Boolean).join("\n");

    return {
      company_id: companyId,
      created_at:
        clean(properties.createdate) ||
        new Date().toISOString(),
      name,
      email: clean(properties.email) || null,
      phone: clean(properties.phone) || null,
      source:
        sourceDetail ||
        hubSpotSourceLabel(sourceCode) ||
        sourceCode ||
        null,
      channel_id: channelForHubSpot(sourceCode, lookups.channels),
      service_id: serviceForReno(rawService, lookups.services),
      municipality: clean(properties.city) || null,
      postal_code: postcode || null,
      sales_stage: stage,
      crm_status: hubSpotCrmStatus(properties, deal),
      notes: notes || null,
      closed_at:
        deal && (stage === "won" || stage === "lost")
          ? clean(deal.properties.closedate) || null
          : null,
      lost_reason:
        stage === "lost" && deal
          ? clean(deal.properties.closed_lost_reason) || null
          : null,
      crm_source: "hubspot",
      crm_external_id: contact.id,
    };
  });

  const importedLeads = await upsertLeads(admin, leads);
  const leadByExternalId = new Map(
    importedLeads
      .filter((lead) => lead.crm_external_id)
      .map((lead) => [String(lead.crm_external_id), lead]),
  );

  const projects = [];

  for (const deal of deals) {
    if (isSampleDeal(deal)) continue;
    if (!isWonDeal(deal)) continue;

    const contactId =
      deal.associations?.contacts?.results?.[0]?.id;

    if (!contactId) continue;

    const lead = leadByExternalId.get(contactId);

    if (!lead) continue;

    projects.push({
      lead_id: lead.id,
      service_id: lead.service_id,
      project_value: numberOrNull(
        deal.properties.amount_in_home_currency,
      ),
      status: "won",
      won_at:
        clean(deal.properties.closedate) ||
        clean(deal.properties.createdate) ||
        new Date().toISOString(),
      crm_source: "hubspot",
      crm_external_id: deal.id,
    });
  }

  let importedProjects: Array<{
    id: string;
    crm_external_id: string | null;
    project_value: number | string | null;
    won_at: string | null;
    lead_id: string;
  }> = [];

  if (projects.length) {
    const result = await admin
      .from("projects")
      .upsert(projects, {
        onConflict: "lead_id,crm_source,crm_external_id",
      })
      .select(
        "id,crm_external_id,project_value,won_at,lead_id",
      );

    if (result.error) {
      throw new Error(
        `Unable to import HubSpot projects: ${result.error.message}`,
      );
    }

    importedProjects = result.data ?? [];
  }

  const leadById = new Map(
    importedLeads.map((lead) => [lead.id, lead]),
  );

  const revenueRows = importedProjects
    .filter((project) => Number(project.project_value ?? 0) > 0)
    .map((project) => {
      const lead = leadById.get(project.lead_id);

      return {
        project_id: project.id,
        company_id: companyId,
        channel_id: lead?.channel_id ?? null,
        campaign_id: null,
        model: "first_touch",
        attributed_revenue: Number(project.project_value),
        weight: 1,
        attributed_at:
          project.won_at || new Date().toISOString(),
      };
    });

  if (revenueRows.length) {
    const revenueResult = await admin
      .from("revenue_attribution")
      .upsert(revenueRows, {
        onConflict: "project_id,model",
      });

    if (revenueResult.error) {
      throw new Error(
        `Unable to import HubSpot revenue: ${revenueResult.error.message}`,
      );
    }
  }

  return {
    recordsImported:
      importedLeads.length +
      importedProjects.length,
    leadsImported: importedLeads.length,
    projectsImported: importedProjects.length,
    revenueImported: revenueRows.length,
  };
}

async function fetchAllHubSpotContacts(
  token: string,
): Promise<HubSpotContact[]> {
  const properties = [
    "firstname",
    "lastname",
    "email",
    "phone",
    "createdate",
    "hs_lead_status",
    "lifecyclestage",
    "hs_analytics_source",
    "hs_analytics_source_data_1",
    "hs_analytics_source_data_2",
    "hs_latest_source",
    "hs_latest_source_data_1",
    "city",
    "postcode",
    "zip",
    "wat_wilt_u_laten_renoveren",
    "preferred_renovation_type",
    "wanneer_wilt_u_starten",
    "lead_question",
  ];

  return fetchHubSpotObjects<HubSpotContact>(
    token,
    "contacts",
    properties,
    "deals",
  );
}

async function fetchAllHubSpotDeals(
  token: string,
): Promise<HubSpotDeal[]> {
  const properties = [
    "dealname",
    "pipeline",
    "dealstage",
    "amount_in_home_currency",
    "hs_is_closed_won",
    "hs_is_closed_lost",
    "closedate",
    "createdate",
    "closed_lost_reason",
    "closed_won_reason",
  ];

  return fetchHubSpotObjects<HubSpotDeal>(
    token,
    "deals",
    properties,
    "contacts",
  );
}

async function fetchHubSpotObjects<T>(
  token: string,
  objectType: string,
  properties: string[],
  associations: string,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | undefined;

  do {
    const url = new URL(
      `https://api.hubapi.com/crm/v3/objects/${objectType}`,
    );

    url.searchParams.set("limit", "100");
    url.searchParams.set(
      "properties",
      properties.join(","),
    );
    url.searchParams.set(
      "associations",
      associations,
    );

    if (after) {
      url.searchParams.set("after", after);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const json = await response.json() as HubSpotPage<T> & {
      message?: string;
    };

    if (!response.ok) {
      throw new Error(
        json.message ||
        `HubSpot API returned HTTP ${response.status}.`,
      );
    }

    all.push(...(json.results ?? []));
    after = json.paging?.next?.after;
  } while (after);

  return all;
}

// =========================================================
// DATABASE HELPERS
// =========================================================

async function upsertLeads(
  admin: AdminClient,
  rows: Array<Record<string, unknown>>,
): Promise<ImportedLeadRow[]> {
  if (!rows.length) return [];

  const result = await admin
    .from("leads")
    .upsert(rows, {
      onConflict:
        "company_id,crm_source,crm_external_id",
    })
    .select(
      "id,crm_external_id,channel_id,service_id",
    );

  if (result.error) {
    throw new Error(
      `Unable to import CRM leads: ${result.error.message}`,
    );
  }

  return (result.data ?? []) as ImportedLeadRow[];
}

// =========================================================
// MAPPINGS
// =========================================================

function mondayStage(
  status?: string,
  rejection?: string,
) {
  const value = normalize(
    [status, rejection].filter(Boolean).join(" "),
  );

  if (
    includesAny(value, [
      "gewonnen",
      "akkoord",
      "contract",
      "accepted",
      "won",
    ])
  ) return "won";

  if (
    includesAny(value, [
      "afgewezen",
      "verloren",
      "geen interesse",
      "incorrect contact",
      "rejected",
      "lost",
    ])
  ) return "lost";

  if (
    includesAny(value, [
      "offerte",
      "proposal",
      "quote",
      "onderhandeling",
    ])
  ) return "quote_sent";

  if (
    includesAny(value, [
      "bezoek uitgevoerd",
      "afspraak uitgevoerd",
      "visit completed",
    ])
  ) return "visit_completed";

  if (
    includesAny(value, [
      "bezoek gepland",
      "afspraak",
      "visit booked",
    ])
  ) return "visit_booked";

  if (
    includesAny(value, [
      "qualified",
      "gekwalificeerd",
      "interesse",
    ])
  ) return "qualified";

  if (
    includesAny(value, [
      "voicemail",
      "gebeld",
      "contact",
      "onbereikbaar",
      "bereikt",
    ])
  ) return "contacted";

  return "new";
}

function hubSpotCrmStatus(
  contact: Record<string, string | null | undefined>,
  deal?: HubSpotDeal,
) {
  if (deal) {
    const stage = clean(deal.properties.dealstage);

    const labels: Record<string,string> = {
      "5229984993": "Lead Identified",
      "5229984994": "Initial Consultation",
      "5229984995": "Proposal Sent",
      "5229984996": "Negotiation",
      "5229984997": "Contract Signed",
      closedwon: "Closed Won",
      closedlost: "Closed Lost",
    };

    if (stage) {
      return labels[stage] ?? stage;
    }
  }

  return (
    clean(contact.hs_lead_status) ||
    clean(contact.lifecyclestage) ||
    null
  );
}

function hubSpotStage(
  contact: Record<string, string | null | undefined>,
  deal?: HubSpotDeal,
) {
  if (deal) {
    const stage = clean(deal.properties.dealstage);

    if (
      clean(deal.properties.hs_is_closed_won) === "true" ||
      stage === "closedwon" ||
      stage === "5229984997"
    ) return "won";

    if (
      clean(deal.properties.hs_is_closed_lost) === "true" ||
      stage === "closedlost"
    ) return "lost";

    if (
      stage === "5229984995" ||
      stage === "5229984996"
    ) return "quote_sent";

    if (stage === "5229984994") {
      return "visit_booked";
    }

    if (stage === "5229984993") {
      return "qualified";
    }
  }

  const leadStatus = normalize(contact.hs_lead_status);
  const lifecycle = normalize(contact.lifecyclestage);

  if (lifecycle === "customer") return "won";

  if (
    includesAny(leadStatus, [
      "unqualified",
      "bad timing",
    ])
  ) return "lost";

  if (leadStatus === "open deal") {
    return "qualified";
  }

  if (
    includesAny(leadStatus, [
      "attempted to contact",
      "connected",
      "in progress",
      "open",
    ])
  ) return "contacted";

  if (
    lifecycle === "opportunity" ||
    lifecycle === "salesqualifiedlead" ||
    lifecycle === "marketingqualifiedlead"
  ) return "qualified";

  return "new";
}

function channelForMonday(
  source: string,
  channels: Map<string, string>,
) {
  const value = normalize(source);

  if (
    value.includes("facebook") ||
    value.includes("meta") ||
    value.includes("instagram")
  ) {
    return channels.get(normalize("Meta Ads")) ?? null;
  }

  if (
    value.includes("google ads") ||
    value.includes("google ad")
  ) {
    return channels.get(normalize("Google Ads")) ?? null;
  }

  if (value.includes("referral")) {
    return channels.get(normalize("Referral")) ?? null;
  }

  return null;
}

function channelForHubSpot(
  source: string,
  channels: Map<string, string>,
) {
  const value = normalize(source);

  const channelName =
    value === "paid social" ? "Meta Ads" :
    value === "paid search" ? "Google Ads" :
    value === "organic search" ? "Google Organic" :
    value === "social media" ? "Instagram / Facebook Organic" :
    value === "referrals" ? "Referral" :
    value === "direct traffic" ? "Direct" :
    null;

  return channelName
    ? channels.get(normalize(channelName)) ?? null
    : null;
}

function hubSpotSourceLabel(source: string) {
  const labels: Record<string, string> = {
    PAID_SOCIAL: "Paid Social",
    PAID_SEARCH: "Paid Search",
    ORGANIC_SEARCH: "Organic Search",
    SOCIAL_MEDIA: "Organic Social",
    REFERRALS: "Referral",
    DIRECT_TRAFFIC: "Direct",
    EMAIL_MARKETING: "Email Marketing",
    OTHER_CAMPAIGNS: "Other Campaign",
    OFFLINE: "Offline",
    AI_REFERRALS: "AI Referral",
  };

  return labels[source] ?? source;
}

function serviceForIsoprotech(
  raw: string,
  services: Map<string, string>,
) {
  const value = normalize(raw);

  const name =
    value.includes("gevelisolatie") ? "Gevelisolatie" :
    value.includes("gevelrenovatie") ? "Gevelrenovatie" :
    value.includes("dakisolatie") ? "Dakisolatie" :
    value.includes("dakrenovatie") ? "Dakrenovatie" :
    value.includes("dakkapel") ? "Dakkapel" :
    value.includes("asbest") ? "Asbest" :
    null;

  return name
    ? services.get(normalize(name)) ?? null
    : null;
}

function serviceForReno(
  raw: string,
  services: Map<string, string>,
) {
  const value = normalize(raw);

  const name =
    value.includes("badkamer") ||
    value.includes("bathroom")
      ? "Badkamerrenovatie"
    : value.includes("totaal") ||
      value.includes("total renovation")
      ? "Totaalrenovatie"
    : value.includes("gyproc") ||
      value.includes("pleister")
      ? "Gyproc / pleisterwerken"
    : value.includes("vloer")
      ? "Vloeren"
    : value.includes("schilder")
      ? "Schilderwerken"
    : value.includes("tegel")
      ? "Tegelwerken"
    : value.includes("interieur")
      ? "Interieurafwerking"
    : null;

  return name
    ? services.get(normalize(name)) ?? null
    : null;
}

function isWonDeal(deal: HubSpotDeal) {
  return (
    clean(deal.properties.hs_is_closed_won) === "true" ||
    clean(deal.properties.dealstage) === "closedwon"
  );
}

function isSampleDeal(deal: HubSpotDeal) {
  return normalize(clean(deal.properties.dealname))
    .includes("sample deal");
}

function compareDeals(a: HubSpotDeal, b: HubSpotDeal) {
  const aWon = isWonDeal(a) ? 1 : 0;
  const bWon = isWonDeal(b) ? 1 : 0;

  if (aWon !== bWon) return bWon - aWon;

  const aDate = Date.parse(
    clean(a.properties.closedate) ||
    clean(a.properties.createdate) ||
    "1970-01-01",
  );

  const bDate = Date.parse(
    clean(b.properties.closedate) ||
    clean(b.properties.createdate) ||
    "1970-01-01",
  );

  return bDate - aDate;
}

// =========================================================
// GENERAL HELPERS
// =========================================================

function crmDate(
  dateText?: string,
  fallback?: string,
) {
  if (dateText) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      return `${dateText}T12:00:00.000Z`;
    }

    const parsed = Date.parse(dateText);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  if (fallback) {
    const parsed = Date.parse(fallback);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function numberOrNull(value?: string | null) {
  if (!value) return null;

  const number = Number(
    value.replace(/[^0-9,.-]/g, "").replace(",", "."),
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function looksLikePostalCode(value: string) {
  return /^\d{4}$/.test(value.trim());
}

function normalize(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function includesAny(
  value: string,
  needles: string[],
) {
  return needles.some((needle) =>
    value.includes(normalize(needle)),
  );
}

function clean(value?: string | null) {
  return (value ?? "").trim();
}

function required(name: string) {
  const value = process.env[name];

  if (!value || value === "[SENSITIVE]") {
    throw new Error(`Missing server setting: ${name}`);
  }

  return value;
}
