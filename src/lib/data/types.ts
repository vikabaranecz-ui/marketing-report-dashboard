export type CompanyId = string;

export type Company = {
  id: CompanyId;
  name: string;
  shortName: string;
  accent: string;
};

export type ChannelMetric = {
  id: string;
  channel: string;
  spend: number;
  impressions: number;
  clicks: number;
  platformConversions: number;
  leads: number;
  qualified: number;
  visits: number;
  quotes: number;
  won: number;
  revenue: number;
};

export type Lead = {
  id: string;
  date: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  campaign: string;
  ad: string;
  service: string;
  municipality: string;
  quality: "A" | "B" | "C";
  stage: string;
  quoteValue: number | null;
  wonRevenue: number | null;
  salesperson: string;
  daysOpen: number;
  notes: string;
  utm: string;
};

export type ServiceMetric = {
  id: string;
  name: string;
  spend: number;
  leads: number;
  qualified: number;
  visits: number;
  quotes: number;
  won: number;
  revenue: number;
  grossMargin: number | null;
};

export type CampaignMetric = {
  id: string;
  name: string;
  channel: string;
  childLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  visits: number;
  won: number;
  revenue: number;
  angle: string;
};

export type TrendPoint = {
  date: string;
  spend: number;
  leads: number;
  qualified: number;
  revenue: number;
  cpl: number;
  cac: number;
  roas: number;
  sessions: number;
  conversions: number;
};

export type LocationMetric = {
  municipality: string;
  leads: number;
  qualified: number;
  won: number;
  revenue: number;
  spend: number;
};

export type Integration = {
  id: string;
  provider: "meta" | "google_ads" | "ga4" | "search_console" | "google_business" | "monday" | "hubspot" | "website_forms";
  name: string;
  status: "Connected" | "Connecting" | "Not connected" | "Error";
  lastSuccess: string | null;
  lastAttempt: string | null;
  records: number;
  resource: string;
  errorMessage: string | null;
};

export type CompanyDataset = {
  company: Company;
  periodLabel: string;
  comparisonLabel: string;
  metrics: { spend: number; leads: number; qualified: number; visits: number; quotes: number; won: number; revenue: number; grossProfit: number | null };
  previous: { spend: number; leads: number; qualified: number; visits: number; quotes: number; won: number; revenue: number };
  channels: ChannelMetric[];
  leads: Lead[];
  services: ServiceMetric[];
  campaigns: CampaignMetric[];
  trend: TrendPoint[];
  locations: LocationMetric[];
  website: { users: number; sessions: number; newUsers: number; engagedSessions: number; formSubmissions: number; whatsappClicks: number; phoneClicks: number; quoteRequests: number };
  seo: { impressions: number; clicks: number; ctr: number; position: number; brandedShare: number };
  integrations: Integration[];
  dataHealth: { missingSource: number; missingService: number; missingCampaign: number; wonMissingRevenue: number; duplicates: number; campaignsWithoutSpend: number; daysSinceSync: number | null };
};
