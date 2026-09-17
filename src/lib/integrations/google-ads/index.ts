import "server-only";

import { googleAdsHeaders, googleJson } from "../google/client";
import {
  normalizeGoogleAdsInsight,
  normalizeGoogleAdsResource,
  normalizeGoogleCustomerId,
  type GoogleAdsInsight,
  type GoogleAdsResource,
} from "../google/core";

const GOOGLE_ADS_API_VERSION = "v25";
const GOOGLE_ADS_ROOT =
  `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

export async function discoverGoogleAdsCustomers(
  accessToken: string,
): Promise<GoogleAdsResource[]> {
  const accessible = await googleJson<{ resourceNames?: string[] }>(
    `${GOOGLE_ADS_ROOT}/customers:listAccessibleCustomers`,
    accessToken,
    {},
    googleAdsHeaders(),
    {
      apiName: "Google Ads API",
      resource: "the authorized Google account",
    },
  );
  const directIds = (accessible.resourceNames ?? [])
    .map(name => normalizeGoogleCustomerId(name))
    .filter(Boolean);
  const resources = new Map<string, GoogleAdsResource>();
  const managers: string[] = [];

  for (const customerId of directIds) {
    const rows = await googleAdsSearch(
      accessToken,
      customerId,
      [
        "SELECT customer.id, customer.descriptive_name,",
        "customer.currency_code, customer.time_zone, customer.manager",
        "FROM customer LIMIT 1",
      ].join(" "),
    );
    const customer = record(rows[0]?.customer);
    const resource = normalizeGoogleAdsResource({
      id: customer.id,
      descriptiveName: customer.descriptiveName,
      currencyCode: customer.currencyCode,
      timeZone: customer.timeZone,
    });

    if (customer.manager === true) managers.push(customerId);
    else if (resource) resources.set(resource.id, resource);
  }

  for (const managerId of managers) {
    const rows = await googleAdsSearch(
      accessToken,
      managerId,
      [
        "SELECT customer_client.id, customer_client.descriptive_name,",
        "customer_client.currency_code, customer_client.time_zone,",
        "customer_client.manager, customer_client.level,",
        "customer_client.status, customer_client.hidden",
        "FROM customer_client",
        "WHERE customer_client.status = 'ENABLED'",
      ].join(" "),
      managerId,
    );

    for (const row of rows) {
      const client = record(row.customerClient);
      if (client.manager === true || client.hidden === true || Number(client.level) === 0) continue;
      const resource = normalizeGoogleAdsResource({
        id: client.id,
        descriptiveName: client.descriptiveName,
        currencyCode: client.currencyCode,
        timeZone: client.timeZone,
      }, managerId);
      if (resource && !resources.has(resource.id)) resources.set(resource.id, resource);
    }
  }

  return [...resources.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchGoogleAdsDailyInsights(
  accessToken: string,
  customerId: string,
  loginCustomerId: string | undefined,
  from: string,
  to: string,
): Promise<GoogleAdsInsight[]> {
  const rows = await googleAdsSearch(
    accessToken,
    normalizeGoogleCustomerId(customerId),
    [
      "SELECT segments.date, customer.id, campaign.id, campaign.name,",
      "ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name,",
      "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions",
      "FROM ad_group_ad",
      `WHERE segments.date BETWEEN '${from}' AND '${to}'`,
    ].join(" "),
    loginCustomerId,
  );

  return rows
    .map(normalizeGoogleAdsInsight)
    .filter((row): row is GoogleAdsInsight => row !== null);
}

async function googleAdsSearch(
  accessToken: string,
  customerId: string,
  query: string,
  loginCustomerId?: string,
) {
  const chunks = await googleJson<{ results?: Record<string, unknown>[] }[]>(
    `${GOOGLE_ADS_ROOT}/customers/${normalizeGoogleCustomerId(customerId)}/googleAds:searchStream`,
    accessToken,
    { method: "POST", body: JSON.stringify({ query }) },
    googleAdsHeaders(loginCustomerId),
    {
      apiName: "Google Ads API",
      resource: `customer ${normalizeGoogleCustomerId(customerId)}`,
    },
  );
  return chunks.flatMap(chunk => chunk.results ?? []);
}

function record(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}
