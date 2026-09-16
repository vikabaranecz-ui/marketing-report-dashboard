import { ServerOnlyConnector } from "../base";
import type { NormalizedMarketingMetric } from "../types";

type MetaRow = Record<string, string | number | undefined>;

export class MetaAdsConnector extends ServerOnlyConnector<MetaRow, NormalizedMarketingMetric> {
  provider = "meta" as const;
  async fetch(): Promise<MetaRow[]> {
    this.requireSecret("META_APP_SECRET");
    throw new Error("Meta Ads importer is configured but not implemented yet.");
  }
  normalize(companyId: string, records: MetaRow[]): NormalizedMarketingMetric[] {
    return records.map((row) => ({ date: String(row.date_start), companyId, channelExternalId: "meta", campaignExternalId: String(row.campaign_id ?? ""), adGroupExternalId: String(row.adset_id ?? ""), adExternalId: String(row.ad_id ?? ""), spend: Number(row.spend ?? 0), impressions: Number(row.impressions ?? 0), reach: Number(row.reach ?? 0), clicks: Number(row.clicks ?? 0), landingPageViews: Number(row.landing_page_views ?? 0), platformConversions: Number(row.actions ?? 0) }));
  }
}
