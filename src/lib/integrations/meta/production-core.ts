import type { MetaLeadRecord } from "./lead-attribution-core";

export const META_REQUIRED_PERMISSIONS = [
  "ads_read",
  "ads_management",
  "business_management",
  "leads_retrieval",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_ads",
] as const;

export type MetaRequiredPermission = typeof META_REQUIRED_PERMISSIONS[number];
export type MetaPermissionStatus = {
  permission: string;
  status: string;
};

export type MetaReadinessStatus =
  | "Ready"
  | "Missing permissions"
  | "App Review / Advanced Access required";

export function parseMetaPermissionRows(rows: unknown[]) {
  const statuses: Record<string, string> = {};
  for (const value of rows) {
    const row = record(value);
    const permission = text(row.permission);
    const status = text(row.status).toLowerCase();
    if (permission && status) statuses[permission] = status;
  }

  const granted = META_REQUIRED_PERMISSIONS.filter(
    permission => statuses[permission] === "granted",
  );
  const missing = META_REQUIRED_PERMISSIONS.filter(
    permission => statuses[permission] !== "granted",
  );
  const explicitlyUnavailable = missing.some(permission => Boolean(statuses[permission]));
  const status: MetaReadinessStatus = missing.length === 0
    ? "Ready"
    : explicitlyUnavailable
      ? "Missing permissions"
      : "App Review / Advanced Access required";

  return {
    granted: [...granted],
    missing: [...missing],
    statuses,
    status,
    adsInsightsAvailable: granted.includes("ads_read") || granted.includes("ads_management"),
    leadAdsAvailable: missing.length === 0,
  };
}

export type MetaAdContext = {
  id: string;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  pageId: string | null;
  formIds: string[];
};

export function metaAdContext(value: unknown): MetaAdContext | null {
  const row = record(value);
  const id = text(row.id);
  if (!id) return null;
  const campaign = record(row.campaign);
  const adset = record(row.adset);
  const creative = record(row.creative);
  const story = record(creative.object_story_spec);
  return {
    id,
    adName: nullableText(row.name),
    campaignId: nullableText(campaign.id),
    campaignName: nullableText(campaign.name),
    adsetId: nullableText(adset.id),
    adsetName: nullableText(adset.name),
    pageId: nullableText(story.page_id),
    formIds: collectExactIds(story, "lead_gen_form_id"),
  };
}

export function selectedMetaLeadRecord(
  value: unknown,
  pageId: string | null,
  formId: string,
  ads: Map<string, MetaAdContext>,
): MetaLeadRecord | null {
  const lead = record(value);
  const id = text(lead.id);
  const adId = text(lead.ad_id);
  const ad = ads.get(adId);
  if (!id || !adId || !ad) return null;

  return {
    id,
    createdTime: text(lead.created_time),
    pageId: ad.pageId ?? pageId,
    formId: nullableText(lead.form_id) ?? formId,
    campaignExternalId: nullableText(lead.campaign_id) ?? ad.campaignId,
    campaignName: nullableText(lead.campaign_name) ?? ad.campaignName,
    adsetExternalId: nullableText(lead.adset_id) ?? ad.adsetId,
    adsetName: nullableText(lead.adset_name) ?? ad.adsetName,
    adExternalId: adId,
    adName: nullableText(lead.ad_name) ?? ad.adName,
    email: leadField(lead.field_data, ["email", "email_address"]),
    phone: leadField(lead.field_data, ["phone_number", "phone", "mobile_phone_number"]),
  };
}

export async function optionalMetaLeadPhase<T>(
  work: () => Promise<T>,
  fallback: string,
): Promise<{ value: T | null; warning: string | null }> {
  try {
    return { value: await work(), warning: null };
  } catch (error) {
    return {
      value: null,
      warning: error instanceof Error && error.message ? error.message : fallback,
    };
  }
}

export async function readMetaSyncSources<TInsight, TLead>(options: {
  fetchInsights: () => Promise<TInsight>;
  fetchLeads: () => Promise<TLead>;
  leadAdsAvailable: boolean;
  unavailableWarning: string;
}) {
  const insights = await options.fetchInsights();
  if (!options.leadAdsAvailable) {
    return { insights, leads: null as TLead | null, warning: options.unavailableWarning };
  }
  const leadPhase = await optionalMetaLeadPhase(
    options.fetchLeads,
    "Meta Lead Ads data could not be retrieved.",
  );
  return { insights, leads: leadPhase.value, warning: leadPhase.warning };
}

function collectExactIds(value: unknown, key: string) {
  const found = new Set<string>();
  visit(value);
  return [...found];

  function visit(current: unknown) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [name, nested] of Object.entries(current as Record<string, unknown>)) {
      if (name === key) {
        const id = text(nested);
        if (id) found.add(id);
      } else {
        visit(nested);
      }
    }
  }
}

function leadField(value: unknown, names: string[]) {
  if (!Array.isArray(value)) return null;
  const accepted = new Set(names);
  for (const field of value) {
    const row = record(field);
    if (!accepted.has(text(row.name))) continue;
    const values = Array.isArray(row.values) ? row.values : [];
    const first = values.find(item => typeof item === "string" && item.trim());
    if (typeof first === "string") return first.trim();
  }
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function nullableText(value: unknown) {
  return text(value) || null;
}
