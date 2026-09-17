export type GoogleCredential = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
};

export type GoogleAdsResource = {
  id: string;
  name: string;
  customer_id: string;
  login_customer_id?: string;
  currency: string | null;
  timezone: string | null;
};

export type GoogleAdsInsight = {
  date: string;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

export type Ga4Metric = {
  date: string;
  users: number;
  sessions: number;
  newUsers: number;
  engagedSessions: number;
  formSubmissions: number;
  whatsappClicks: number;
  phoneClicks: number;
  quoteRequests: number;
};

export type SearchConsoleMetric = {
  date: string;
  query: string | null;
  page: string | null;
  clicks: number;
  impressions: number;
  positionSum: number;
};

export type GbpMetric = {
  date: string;
  profileViews: number;
  websiteClicks: number;
  calls: number;
  directionRequests: number;
  messages: number;
  searches: number;
  reviews: number;
  ratingSum: number;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function refreshGoogleCredential(
  existing: GoogleCredential,
  options: {
    clientId: string;
    clientSecret: string;
    fetchImpl?: FetchLike;
    now?: number;
  },
): Promise<GoogleCredential> {
  if (!existing.refreshToken) {
    throw new Error("Google authorization has no refresh token. Reconnect Google with offline access.");
  }

  const response = await (options.fetchImpl ?? fetch)(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        refresh_token: existing.refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    },
  );
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;

  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error(`Google token refresh failed: ${googleError(body, response.status)}`);
  }

  const expiresIn = number(body.expires_in);
  const now = options.now ?? Date.now();
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token.trim()
      ? body.refresh_token
      : existing.refreshToken,
    expiresAt: expiresIn > 0
      ? new Date(now + expiresIn * 1000).toISOString()
      : existing.expiresAt,
    scopes: typeof body.scope === "string"
      ? body.scope.split(/\s+/).filter(Boolean)
      : existing.scopes,
  };
}

export function normalizeGoogleCustomerId(value: unknown) {
  return text(value).replace(/\D/g, "");
}

export function costMicrosToCurrency(value: unknown) {
  return nonNegative(value) / 1_000_000;
}

export function normalizeGoogleAdsResource(
  row: Record<string, unknown>,
  loginCustomerId?: string,
): GoogleAdsResource | null {
  const id = normalizeGoogleCustomerId(row.id);
  if (!id) return null;

  return {
    id,
    name: text(row.descriptiveName) || id,
    customer_id: id,
    ...(loginCustomerId && loginCustomerId !== id
      ? { login_customer_id: normalizeGoogleCustomerId(loginCustomerId) }
      : {}),
    currency: nullableText(row.currencyCode),
    timezone: nullableText(row.timeZone),
  };
}

export function normalizeGoogleAdsInsight(
  row: Record<string, unknown>,
): GoogleAdsInsight | null {
  const segments = record(row.segments);
  const campaign = record(row.campaign);
  const adGroup = record(row.adGroup);
  const adGroupAd = record(row.adGroupAd);
  const ad = record(adGroupAd.ad);
  const metrics = record(row.metrics);
  const date = text(segments.date);
  const campaignId = text(campaign.id);
  const adGroupId = text(adGroup.id);
  const adId = text(ad.id);

  if (!date || !campaignId || !adGroupId || !adId) return null;

  return {
    date,
    campaignId,
    campaignName: text(campaign.name) || campaignId,
    adGroupId,
    adGroupName: text(adGroup.name) || adGroupId,
    adId,
    adName: text(ad.name) || adId,
    spend: costMicrosToCurrency(metrics.costMicros),
    impressions: nonNegative(metrics.impressions),
    clicks: nonNegative(metrics.clicks),
    conversions: nonNegative(metrics.conversions),
  };
}

export function googleAdsFactIdentity(
  companyId: string,
  customerId: string,
  row: GoogleAdsInsight,
) {
  return {
    companyId,
    adAccountId: `google_ads:${normalizeGoogleCustomerId(customerId)}`,
    date: row.date,
    campaignExternalId: row.campaignId,
    adGroupExternalId: row.adGroupId,
    adExternalId: row.adId,
  };
}

export function googleAdsReplacementScope(
  companyId: string,
  channelId: string,
) {
  return { companyId, channelId };
}

export function matchesGoogleAdsReplacementScope(
  row: { companyId: string; channelId: string },
  scope: ReturnType<typeof googleAdsReplacementScope>,
) {
  return row.companyId === scope.companyId && row.channelId === scope.channelId;
}

export function normalizeGa4Row(row: Record<string, unknown>): Ga4Metric | null {
  const dimensions = values(row.dimensionValues);
  const metrics = values(row.metricValues);
  const rawDate = text(dimensions[0]?.value);
  if (!/^\d{8}$/.test(rawDate)) return null;

  return {
    date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6)}`,
    users: nonNegative(metrics[0]?.value),
    sessions: nonNegative(metrics[1]?.value),
    newUsers: nonNegative(metrics[2]?.value),
    engagedSessions: nonNegative(metrics[3]?.value),
    formSubmissions: 0,
    whatsappClicks: 0,
    phoneClicks: 0,
    quoteRequests: 0,
  };
}

export function normalizeSearchConsoleRow(
  row: Record<string, unknown>,
): SearchConsoleMetric | null {
  const keys = Array.isArray(row.keys) ? row.keys : [];
  const date = text(keys[0]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const impressions = nonNegative(row.impressions);

  return {
    date,
    query: nullableText(keys[1]),
    page: nullableText(keys[2]),
    clicks: nonNegative(row.clicks),
    impressions,
    positionSum: nonNegative(row.position) * impressions,
  };
}

export function normalizeGbpTimeSeries(
  series: Record<string, unknown>[],
): GbpMetric[] {
  const byDate = new Map<string, GbpMetric>();

  for (const item of series) {
    const metric = text(item.dailyMetric);
    const datedValues = values(record(item.timeSeries).datedValues);
    for (const datedValue of datedValues) {
      const dateValue = record(datedValue.date);
      const date = isoParts(dateValue);
      if (!date) continue;
      const row = byDate.get(date) ?? emptyGbpMetric(date);
      const value = nonNegative(datedValue.value);

      if (metric.startsWith("BUSINESS_IMPRESSIONS_")) row.profileViews += value;
      if (metric === "WEBSITE_CLICKS") row.websiteClicks += value;
      if (metric === "CALL_CLICKS") row.calls += value;
      if (metric === "BUSINESS_DIRECTION_REQUESTS") row.directionRequests += value;
      byDate.set(date, row);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function findAccessibleResource<T extends { id: string }>(
  resources: T[],
  requestedId: string,
) {
  return resources.find(resource => resource.id === requestedId) ?? null;
}

function emptyGbpMetric(date: string): GbpMetric {
  return {
    date,
    profileViews: 0,
    websiteClicks: 0,
    calls: 0,
    directionRequests: 0,
    messages: 0,
    searches: 0,
    reviews: 0,
    ratingSum: 0,
  };
}

function isoParts(value: Record<string, unknown>) {
  const year = number(value.year);
  const month = number(value.month);
  const day = number(value.day);
  if (!year || !month || !day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function googleError(body: Record<string, unknown>, status: number) {
  const error = record(body.error);
  return text(error.message) || text(body.error_description) || `HTTP ${status}`;
}

function values(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(item => Boolean(item) && typeof item === "object") as Record<string, unknown>[]
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value);
}

function nullableText(value: unknown) {
  return text(value) || null;
}

function number(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function nonNegative(value: unknown) {
  return Math.max(0, number(value));
}
