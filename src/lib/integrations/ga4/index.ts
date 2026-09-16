import { ServerOnlyConnector } from "../base";
import type { NormalizedWebsiteMetric } from "../types";

type Ga4Row = Record<string, string | number | undefined>;

export class Ga4Connector extends ServerOnlyConnector<Ga4Row, NormalizedWebsiteMetric> {
  provider = "ga4" as const;
  async fetch(): Promise<Ga4Row[]> { this.requireSecret("GOOGLE_CLOUD_PROJECT_ID"); throw new Error("GA4 importer is prepared but not enabled until OAuth credentials and a property are selected."); }
  normalize(companyId: string, rows: Ga4Row[]): NormalizedWebsiteMetric[] { return rows.map((row) => ({ date: String(row.date), companyId, landingPage: optional(row.landing_page), source: optional(row.source), medium: optional(row.medium), deviceCategory: optional(row.device_category), users: number(row.users), sessions: number(row.sessions), newUsers: number(row.new_users), engagedSessions: number(row.engaged_sessions), formSubmissions: number(row.form_submissions), whatsappClicks: number(row.whatsapp_clicks), phoneClicks: number(row.phone_clicks), quoteRequests: number(row.conversions) })); }
}

const number = (value: unknown) => Number(value ?? 0);
const optional = (value: unknown) => value === undefined || value === null ? undefined : String(value);
