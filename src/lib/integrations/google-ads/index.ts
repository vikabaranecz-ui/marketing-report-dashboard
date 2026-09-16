import { ServerOnlyConnector } from "../base";
import type { NormalizedMarketingMetric } from "../types";

type GoogleAdsRow = Record<string, string | number | undefined>;

export class GoogleAdsConnector extends ServerOnlyConnector<GoogleAdsRow, NormalizedMarketingMetric> {
  provider = "google_ads" as const;
  async fetch(): Promise<GoogleAdsRow[]> {
    this.requireSecret("GOOGLE_CLOUD_PROJECT_ID");
    throw new Error("Google Ads authorization is prepared; API access must be enabled for the configured Google Cloud project before sync can run.");
  }
  normalize(companyId: string, records: GoogleAdsRow[]): NormalizedMarketingMetric[] {
    return records.map((row) => ({ date: String(row.date), companyId, channelExternalId: "google-ads", campaignExternalId: String(row.campaign_id ?? ""), adGroupExternalId: String(row.ad_group_id ?? ""), adExternalId: String(row.ad_id ?? ""), spend: Number(row.cost_micros ?? 0) / 1_000_000, impressions: Number(row.impressions ?? 0), reach: 0, clicks: Number(row.clicks ?? 0), landingPageViews: 0, platformConversions: Number(row.conversions ?? 0) }));
  }
}
