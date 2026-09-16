import { ServerOnlyConnector } from "../base";
import type { NormalizedSearchMetric } from "../types";

type SearchConsoleRow = { date?: string; query?: string; page?: string; clicks?: number; impressions?: number; position?: number };

export class SearchConsoleConnector extends ServerOnlyConnector<SearchConsoleRow, NormalizedSearchMetric> {
  provider = "search_console" as const;
  async fetch(): Promise<SearchConsoleRow[]> { this.requireSecret("GOOGLE_CLOUD_PROJECT_ID"); throw new Error("Search Console importer is prepared but not enabled until OAuth credentials and a site property are selected."); }
  normalize(companyId: string, rows: SearchConsoleRow[]): NormalizedSearchMetric[] { return rows.map((row) => ({ date: String(row.date), companyId, query: row.query, page: row.page, clicks: Number(row.clicks ?? 0), impressions: Number(row.impressions ?? 0), positionSum: Number(row.position ?? 0) * Number(row.impressions ?? 0) })); }
}
