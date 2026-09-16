import { ServerOnlyConnector } from "../base";
import type { NormalizedMarketingMetric } from "../types";

type GoogleAdsRow = Record<string, string | number | undefined>;

export class GoogleAdsConnector extends ServerOnlyConnector<GoogleAdsRow, NormalizedMarketingMetric> {
  provider = "google-ads" as const;
  async fetch(): Promise<GoogleAdsRow[]> {
    this.requireSecret("GOOGLE_ADS_DEVELOPER_TOKEN");
    throw new Error("Google Ads importer is configured but not implemented yet.");
  }
  normalize(companyId: string, records: GoogleAdsRow[]): NormalizedMarketingMetric[] {
    return records.map((row) => ({ date: String(row.date), companyId, channelExternalId: "google-ads", campaignExternalId: String(row.campaign_id ?? ""), adGroupExternalId: String(row.ad_group_id ?? ""), adExternalId: String(row.ad_id ?? ""), spend: Number(row.cost_micros ?? 0) / 1_000_000, impressions: Number(row.impressions ?? 0), reach: 0, clicks: Number(row.clicks ?? 0), landingPageViews: 0, platformConversions: Number(row.conversions ?? 0) }));
  }
}
