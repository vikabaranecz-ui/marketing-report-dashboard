import "server-only";

import { googleJson } from "../google/client";
import { normalizeGa4Row, type Ga4Metric } from "../google/core";

export type Ga4Resource = {
  id: string;
  name: string;
  property_id: string;
  account_id: string;
  account_name: string;
};

export async function discoverGa4Properties(
  accessToken: string,
): Promise<Ga4Resource[]> {
  const resources: Ga4Resource[] = [];
  let pageToken = "";

  do {
    const url = new URL("https://analyticsadmin.googleapis.com/v1alpha/accountSummaries");
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await googleJson<{
      accountSummaries?: Array<{
        name?: string;
        displayName?: string;
        propertySummaries?: Array<{ property?: string; displayName?: string }>;
      }>;
      nextPageToken?: string;
    }>(url, accessToken, {}, {}, {
      apiName: "Google Analytics Admin API",
      resource: "the authorized Google account",
    });

    for (const account of body.accountSummaries ?? []) {
      const accountId = suffix(account.name);
      for (const property of account.propertySummaries ?? []) {
        const propertyId = suffix(property.property);
        if (!propertyId) continue;
        resources.push({
          id: propertyId,
          name: property.displayName?.trim() || propertyId,
          property_id: propertyId,
          account_id: accountId,
          account_name: account.displayName?.trim() || accountId,
        });
      }
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);

  return resources.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchGa4DailyMetrics(
  accessToken: string,
  propertyId: string,
  from: string,
  to: string,
): Promise<Ga4Metric[]> {
  const rows: Ga4Metric[] = [];
  const limit = 100_000;
  let offset = 0;
  let rowCount = 0;

  do {
    const body = await googleJson<{
      rows?: Record<string, unknown>[];
      rowCount?: number;
    }>(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(suffix(propertyId))}:runReport`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "totalUsers" },
            { name: "sessions" },
            { name: "newUsers" },
            { name: "engagedSessions" },
          ],
          orderBys: [{ dimension: { dimensionName: "date" } }],
          offset: String(offset),
          limit: String(limit),
          keepEmptyRows: false,
        }),
      },
      {},
      {
        apiName: "Google Analytics Data API",
        resource: `property ${suffix(propertyId)}`,
      },
    );
    const sourceRows = body.rows ?? [];
    rows.push(...sourceRows
      .map(normalizeGa4Row)
      .filter((row): row is Ga4Metric => row !== null));
    rowCount = Number(body.rowCount ?? sourceRows.length);
    offset += sourceRows.length;
  } while (offset < rowCount);

  return rows;
}

function suffix(value?: string) {
  return value?.split("/").at(-1)?.trim() ?? "";
}
