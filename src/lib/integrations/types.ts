export type IntegrationProvider = "meta" | "google_ads" | "ga4" | "search_console" | "google_business" | "monday" | "website_forms";

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

export type NormalizedWebsiteMetric = {
  date: string;
  companyId: string;
  landingPage?: string;
  source?: string;
  medium?: string;
  deviceCategory?: string;
  users: number;
  sessions: number;
  newUsers: number;
  engagedSessions: number;
  formSubmissions: number;
  whatsappClicks: number;
  phoneClicks: number;
  quoteRequests: number;
};

export type NormalizedSearchMetric = { date: string; companyId: string; query?: string; page?: string; impressions: number; clicks: number; positionSum: number };
export type NormalizedBusinessProfileMetric = { date: string; companyId: string; profileViews: number; websiteClicks: number; calls: number; directionRequests: number; messages: number; searches: number; reviews: number; ratingSum: number };
export type NormalizedCrmLead = { externalId: string; companyId: string; createdAt: string; salesperson?: string; status?: string; qualification?: string; appointment?: string; quoteStatus?: string; quoteAmount?: number; outcome?: string; lostReason?: string; projectValue?: number };

export interface IntegrationConnector<TRaw, TNormalized> {
  provider: IntegrationProvider;
  fetch(companyId: string, window: SyncWindow): Promise<TRaw[]>;
  normalize(companyId: string, records: TRaw[]): TNormalized[];
}

export type ConnectionConfiguration = {
  account_id?: string;
  account_name?: string;
  ad_account_id?: string;
  ad_account_name?: string;
  customer_id?: string;
  customer_name?: string;
  property_id?: string;
  property_name?: string;
  site_url?: string;
  location_id?: string;
  location_name?: string;
  board_id?: string;
  board_name?: string;
  endpoint_name?: string;
  monday_columns?: MondayColumnMapping;
};

export type MondayColumnMapping = {
  createdAt?: string;
  salesperson?: string;
  leadStatus?: string;
  qualification?: string;
  appointment?: string;
  quoteStatus?: string;
  quoteAmount?: string;
  outcome?: string;
  lostReason?: string;
  projectValue?: string;
};
