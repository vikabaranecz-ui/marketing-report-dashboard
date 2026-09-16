import { ServerOnlyConnector } from "../base";
import type { NormalizedBusinessProfileMetric } from "../types";

type BusinessProfileRow = Record<string, string | number | undefined>;

export class GoogleBusinessConnector extends ServerOnlyConnector<BusinessProfileRow, NormalizedBusinessProfileMetric> {
  provider = "google_business" as const;
  async fetch(): Promise<BusinessProfileRow[]> { this.requireSecret("GOOGLE_CLOUD_PROJECT_ID"); throw new Error("Business Profile Performance importer is prepared but not enabled until OAuth credentials and a location are selected."); }
  normalize(companyId: string, rows: BusinessProfileRow[]): NormalizedBusinessProfileMetric[] { return rows.map((row) => ({ date: String(row.date), companyId, profileViews: Number(row.profile_views ?? 0), websiteClicks: Number(row.website_clicks ?? 0), calls: Number(row.calls ?? 0), directionRequests: Number(row.direction_requests ?? 0), messages: Number(row.messages ?? 0), searches: Number(row.searches ?? 0), reviews: Number(row.reviews ?? 0), ratingSum: Number(row.rating_sum ?? 0) })); }
}
