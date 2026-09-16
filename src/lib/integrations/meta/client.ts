import "server-only";

import { normalizeMetaAdAccountId, normalizeMetaInsight, type MetaAdAccount, type MetaInsight } from "./core";

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
  const result = stringValue(value);
  return result || null;
}
