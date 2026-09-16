export type IntegrationProvider = "meta" | "google-ads" | "ga4" | "search-console" | "google-business" | "monday" | "website-forms";

export type SyncWindow = { from: string; to: string };

export type NormalizedMarketingMetric = {
  date: string;
  companyId: string;
  channelExternalId: string;
  campaignExternalId?: string;
  adGroupExternalId?: string;
  adExternalId?: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  landingPageViews: number;
  platformConversions: number;
};

export interface IntegrationConnector<TRaw, TNormalized> {
  provider: IntegrationProvider;
  fetch(companyId: string, window: SyncWindow): Promise<TRaw[]>;
  normalize(companyId: string, records: TRaw[]): TNormalized[];
}
