import "server-only";

import { googleJson } from "../google/client";
import {
  normalizeSearchConsoleRow,
  type SearchConsoleMetric,
} from "../google/core";

export type SearchConsoleResource = {
  id: string;
  name: string;
  site_url: string;
};

export async function discoverSearchConsoleSites(
  accessToken: string,
): Promise<SearchConsoleResource[]> {
  const body = await googleJson<{
    siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
  }>("https://www.googleapis.com/webmasters/v3/sites", accessToken);

  return (body.siteEntry ?? [])
    .filter(site => site.permissionLevel !== "siteUnverifiedUser")
    .map(site => site.siteUrl?.trim() ?? "")
    .filter(Boolean)
    .map(siteUrl => ({ id: siteUrl, name: siteUrl, site_url: siteUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchSearchConsoleMetrics(
  accessToken: string,
  siteUrl: string,
  from: string,
  to: string,
): Promise<SearchConsoleMetric[]> {
  const rows: SearchConsoleMetric[] = [];
  const rowLimit = 25_000;
  let startRow = 0;

  while (true) {
    const body = await googleJson<{ rows?: Record<string, unknown>[] }>(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          startDate: from,
          endDate: to,
          dimensions: ["date", "query", "page"],
          dataState: "final",
          rowLimit,
          startRow,
        }),
      },
    );
    const sourceRows = body.rows ?? [];
    rows.push(...sourceRows
      .map(normalizeSearchConsoleRow)
      .filter((row): row is SearchConsoleMetric => row !== null));
    if (sourceRows.length < rowLimit) break;
    startRow += sourceRows.length;
  }

  return rows;
}
