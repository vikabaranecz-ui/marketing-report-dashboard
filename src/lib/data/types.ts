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
  notRelevant?: number;
  qualified: number;
  visits: number;
  quotes: number;
  won: number;
  revenue: number;
};

export type SourceMetric = {
  source: string;
  leads: number;
  notRelevant?: number;
  qualified: number;
  visits: number;
  quotes: number;
  won: number;
  revenue: number;
};

export type CommercialClient = {
  id: string;
  externalSource: string;
  externalId: string;
  name: string;
  email: string;
  phone: string;
  municipality: string;
  clientSince: string | null;
  matchedLeadId: string | null;
  matchMethod: string;
  commercialStatus: string;
  offerCount: number;
  projectCount: number;
  invoiceCount: number;
  acceptedOfferTotal: number;
  acceptedOfferTotalExclVat: number;
  projectValueTotal: number;
  projectValueTotalExclVat: number;
  invoicedTotal: number;
  paidTotal: number;
};

export type CommercialDeal = {
  id: string;
  name: string;
  stage: string;
  pipelineGroup: string;
  value: number | null;
  offerStatus: string;
  offerNumber: string;
  lostReason: string;
  linkedLeadId: string | null;
};

export type CommercialOffer = {
  id: string;
  leadId: string;
  leadName: string;
  source: string;
  date: string;
  sentAt: string | null;
  followUpAt: string | null;
  number: string;
  status: string;
  priceInclVat: number;
  priceExclVat: number;
  projectExternalId: string | null;
  attributionStatus: string;
  isOpen: boolean;
  isAccepted: boolean;
  isRejected: boolean;
  isCancelled: boolean;
  daysWaiting: number | null;
};

export type CommercialProject = {
  id: string;
  leadId: string;
  leadName: string;
  source: string;
  externalId: string;
  externalClientId?: string | null;
  date: string;
  status: string;
  valueInclVat: number | null;
  valueExclVat: number | null;
  attributionStatus: string;
};

export type CommercialInvoice = {
  id: string;
  leadId: string | null;
  leadName: string;
  source: string;
  externalClientId?: string | null;
  date: string;
  number: string;
  status: string;
  totalInclVat: number;
  totalExclVat: number;
  paidTotal: number;
  creditedTotal: number;
  projectExternalId: string | null;
  attributionStatus: string;
};

export type CommercialAppointment = {
  leadId: string;
  leadName: string;
  scheduledAt: string;
  completedAt: string | null;
  status: string;
  noShow: boolean;
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
  crmStatus: string;
  commercialStatus: string;
  robawsMatchMethod: string;
  robawsClientId: string;
  quoteNumber: string;
  quoteStatus: string;
  quoteValue: number | null;
  isClient: boolean;
  acquisitionCost: number | null;
  attributionLevel: string;
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

export type BusinessPeriodMetric = {
  label: string;
  fromDate: string;
  toDate: string;
  spend: number;
  invoiced: number;
  paid: number;
  leads: number;
  wonProjects: number;
  wonProjectValue: number;
};

export type BusinessMonthMetric = {
  month: string;
  label: string;
  spend: number;
  invoiced: number;
  paid: number;
  leads: number;
  wonProjects: number;
  wonProjectValue: number;
  complete: boolean;
};

export type BusinessDecisionData = {
  current: BusinessPeriodMetric;
  comparison: BusinessPeriodMetric;
  monthly: BusinessMonthMetric[];
};


export type LocationMetric = {
  municipality: string;
  leads: number;
  qualified: number;
  won: number;
  revenue: number;
  spend: number | null;
};

export type Integration = {
  id: string;
  provider: "meta" | "google_ads" | "ga4" | "search_console" | "google_business" | "monday" | "hubspot" | "robaws" | "website_forms";
  name: string;
  status: "Connected" | "Connecting" | "Not connected" | "Error";
  lastSuccess: string | null;
  lastAttempt: string | null;
  records: number;
  resource: string;
  errorMessage: string | null;
  metaPermissionStatus?: "Ready" | "Missing permissions" | "App Review / Advanced Access required" | null;
  metaMissingPermissions?: string[];
};

export type ReportingChangeEvent = {
  id: number;
  provider: string;
  occurredAt: string;
  metricKey: string;
  title: string;
  detail: string;
  delta: number | null;
  beforeValue: number | null;
  afterValue: number | null;
  severity: "info" | "good" | "warn" | "bad";
};

export type ReportingOverride = {
  id: string;
  periodKey: string;
  scopeType: "company" | "source" | "client";
  scopeKey: string;
  fieldKey: string;
  value: unknown;
  note: string;
  updatedAt: string;
};

export type AutomationSettings = {
  enabled: boolean;
  operationalSchedule: string;
  marketingSchedule: string;
};

export type CompanyDataset = {
  company: Company;
  periodKey?: string;
  periodLabel: string;
  comparisonLabel: string;
  metrics: { spend: number; leads: number; notRelevant?: number; qualified: number; visits: number; quotes: number; won: number; revenue: number; grossProfit: number | null };
  previous: { spend: number; leads: number; notRelevant?: number; qualified: number; visits: number; quotes: number; won: number; revenue: number };
  channels: ChannelMetric[];
  leadSources: SourceMetric[];
  commercialDeals?: CommercialDeal[];
  commercialClients?: CommercialClient[];
  commercialOffers?: CommercialOffer[];
  commercialProjects?: CommercialProject[];
  commercialInvoices?: CommercialInvoice[];
  periodCommercialProjects?: CommercialProject[];
  periodCommercialInvoices?: CommercialInvoice[];
  appointmentLeadIds?: string[];
  commercialAppointments?: CommercialAppointment[];
  leads: Lead[];
  services: ServiceMetric[];
  campaigns: CampaignMetric[];
  trend: TrendPoint[];
  businessDecision?: BusinessDecisionData;
  locations: LocationMetric[];
  website: { users: number; sessions: number; newUsers: number; engagedSessions: number; formSubmissions: number; whatsappClicks: number; phoneClicks: number; quoteRequests: number };
  seo: { impressions: number; clicks: number; ctr: number; position: number; brandedShare: number | null };
  gbp?: { profileViews: number; websiteClicks: number; calls: number; directionRequests: number; messages: number; searches: number; reviews: number; averageRating: number | null };
  integrations: Integration[];
  changeEvents?: ReportingChangeEvent[];
  manualOverrides?: ReportingOverride[];
  automation?: AutomationSettings | null;
  dataHealth: { missingSource: number; missingService: number; missingCampaign: number; wonMissingRevenue: number; duplicates: number; campaignsWithoutSpend: number; daysSinceSync: number | null };
};
