import "server-only";

import { deduplicateMetaLeads, type MetaLeadRecord } from "./lead-attribution-core";
import { normalizeMetaAdAccountId, normalizeMetaInsight, type MetaAdAccount, type MetaInsight } from "./core";
import {
  metaAdContext,
  parseMetaPermissionRows,
  selectedMetaLeadRecord,
  type MetaAdContext,
} from "./production-core";

const GRAPH_ROOT = "https://graph.facebook.com/v26.0";

export async function discoverMetaAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const url = new URL(`${GRAPH_ROOT}/me/adaccounts`);
  url.searchParams.set("fields", "id,name,account_id,currency,timezone_name");
  url.searchParams.set("limit", "200");

  const rows = await fetchAll(url, accessToken);
  return rows.map(row => ({
    id: normalizeMetaAdAccountId(stringValue(row.id) || stringValue(row.account_id)),
    name: stringValue(row.name) || "Unnamed Meta ad account",
    currency: nullableString(row.currency),
    timezone: nullableString(row.timezone_name),
  })).filter(account => account.id);
}

export async function fetchMetaPermissionState(accessToken: string) {
  const url = new URL(`${GRAPH_ROOT}/me/permissions`);
  url.searchParams.set("limit", "200");
  return parseMetaPermissionRows(await fetchAll(url, accessToken));
}

export async function fetchMetaDailyInsights(
  accessToken: string,
  adAccountId: string,
  from: string,
  to: string,
): Promise<MetaInsight[]> {
  const url = new URL(`${GRAPH_ROOT}/${normalizeMetaAdAccountId(adAccountId)}/insights`);
  url.searchParams.set("fields", [
    "date_start",
    "date_stop",
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "ad_name",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "actions",
  ].join(","));
  url.searchParams.set("level", "ad");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: from, until: to }));
  url.searchParams.set("limit", "500");

  const rows = await fetchAll(url, accessToken);
  return rows.map(normalizeMetaInsight).filter((row): row is MetaInsight => row !== null);
}

export async function fetchMetaLeadAds(
  accessToken: string,
  adAccountId: string,
): Promise<{
  records: MetaLeadRecord[];
  retrievalScope: "direct_forms" | "selected_pages" | "accessible_pages_fallback";
  pagesProcessed: number;
  formsProcessed: number;
}> {
  const adsUrl = new URL(`${GRAPH_ROOT}/${normalizeMetaAdAccountId(adAccountId)}/ads`);
  adsUrl.searchParams.set("fields", "id,name,campaign{id,name},adset{id,name},creative{object_story_spec}");
  adsUrl.searchParams.set("limit", "500");
  const adRows = await fetchAll(adsUrl, accessToken);
  const contexts = adRows
    .map(metaAdContext)
    .filter((row): row is MetaAdContext => row !== null);
  const ads = new Map(contexts.map(row => [row.id, row]));
  const relevantPageIds = new Set(contexts.flatMap(row => row.pageId ? [row.pageId] : []));
  const directForms = new Map<string, string | null>();
  for (const ad of contexts) {
    for (const formId of ad.formIds) directForms.set(formId, ad.pageId);
  }

  const pageRows = relevantPageIds.size || directForms.size === 0
    ? await fetchMetaPages(accessToken)
    : [];
  const candidatePages = relevantPageIds.size
    ? pageRows.filter(page => relevantPageIds.has(stringValue(page.id)))
    : directForms.size
      ? []
      : pageRows;
  const retrievalScope = directForms.size && candidatePages.length === 0
    ? "direct_forms" as const
    : relevantPageIds.size
      ? "selected_pages" as const
      : "accessible_pages_fallback" as const;
  const formTargets = new Map<string, { pageId: string | null; accessToken: string }>();

  for (const [formId, pageId] of directForms) {
    const page = pageRows.find(row => stringValue(row.id) === pageId);
    formTargets.set(formId, {
      pageId,
      accessToken: page ? stringValue(page.access_token) || accessToken : accessToken,
    });
  }

  for (const page of candidatePages) {
    const pageId = stringValue(page.id);
    const pageAccessToken = stringValue(page.access_token) || accessToken;
    if (!pageId) continue;
    const pageAds = contexts.filter(ad => ad.pageId === pageId);
    const pageDirectForms = pageAds.flatMap(ad => ad.formIds);
    if (pageDirectForms.length) {
      for (const formId of pageDirectForms) {
        formTargets.set(formId, { pageId, accessToken: pageAccessToken });
      }
      if (pageAds.every(ad => ad.formIds.length > 0)) continue;
    }

    // Meta does not consistently expose lead_gen_form_id on every historical
    // creative. In that case form discovery is restricted to the exact Page ID
    // declared by a selected-account ad. Only if no selected ad exposes any Page
    // or form identity do we fall back to accessible Pages, and every lead is
    // still filtered against the selected account's ad IDs before persistence.
    const formsUrl = new URL(`${GRAPH_ROOT}/${pageId}/leadgen_forms`);
    formsUrl.searchParams.set("fields", "id,name,status");
    formsUrl.searchParams.set("limit", "200");
    for (const form of await fetchAll(formsUrl, pageAccessToken)) {
      const formId = stringValue(form.id);
      if (formId) formTargets.set(formId, { pageId, accessToken: pageAccessToken });
    }
  }

  const records: MetaLeadRecord[] = [];

  for (const [formId, target] of formTargets) {
    const leadsUrl = new URL(`${GRAPH_ROOT}/${formId}/leads`);
    leadsUrl.searchParams.set("fields", [
      "id",
      "created_time",
      "ad_id",
      "ad_name",
      "adset_id",
      "adset_name",
      "campaign_id",
      "campaign_name",
      "form_id",
      "field_data",
    ].join(","));
    leadsUrl.searchParams.set("limit", "500");
    const leads = await fetchAll(leadsUrl, target.accessToken);

    for (const lead of leads) {
      const record = selectedMetaLeadRecord(lead, target.pageId, formId, ads);
      if (record?.createdTime) records.push(record);
    }
  }

  return {
    records: deduplicateMetaLeads(records),
    retrievalScope,
    pagesProcessed: candidatePages.length,
    formsProcessed: formTargets.size,
  };
}

async function fetchMetaPages(accessToken: string) {
  const pagesUrl = new URL(`${GRAPH_ROOT}/me/accounts`);
  pagesUrl.searchParams.set("fields", "id,name,access_token");
  pagesUrl.searchParams.set("limit", "200");
  return fetchAll(pagesUrl, accessToken);
}

async function fetchAll(initialUrl: URL, accessToken: string) {
  const rows: Record<string, unknown>[] = [];
  let next: string | null = initialUrl.toString();

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({})) as {
      data?: Record<string, unknown>[];
      paging?: { next?: string };
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      const detail = body.error?.message ? ` ${body.error.message}` : "";
      throw new Error(`Meta Graph API request failed with HTTP ${response.status}.${detail}`);
    }

    rows.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }

  return rows;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  return stringValue(value) || null;
}
