import { ServerOnlyConnector } from "../base";
import type { NormalizedMarketingMetric, SyncWindow } from "../types";
import { fetchMetaDailyInsights } from "./client";
import type { MetaInsight } from "./core";

export class MetaAdsConnector extends ServerOnlyConnector<MetaInsight, NormalizedMarketingMetric> {
  provider = "meta" as const;
  constructor(private readonly accessToken: string, private readonly adAccountId: string) { super(); }
  async fetch(_companyId: string, window: SyncWindow): Promise<MetaInsight[]> {
    return fetchMetaDailyInsights(this.accessToken, this.adAccountId, window.from, window.to);
  }
  normalize(companyId: string, records: MetaInsight[]): NormalizedMarketingMetric[] {
    return records.map((row) => ({ date: row.date, companyId, channelExternalId: "meta", campaignExternalId: row.campaignId, adGroupExternalId: row.adsetId, adExternalId: row.adId, spend: row.spend, impressions: row.impressions, reach: row.reach, clicks: row.clicks, landingPageViews: row.landingPageViews, platformConversions: row.platformLeads }));
  }
}
