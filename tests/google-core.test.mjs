import assert from "node:assert/strict";
import test from "node:test";

import {
  costMicrosToCurrency,
  findAccessibleResource,
  googleAdsFactIdentity,
  googleAdsReplacementScope,
  matchesGoogleAdsReplacementScope,
  normalizeGa4Row,
  normalizeGbpTimeSeries,
  normalizeGoogleAdsInsight,
  normalizeGoogleAdsResource,
  normalizeSearchConsoleRow,
  refreshGoogleCredential,
} from "../src/lib/integrations/google/core.ts";

test("Google token refresh preserves the existing refresh token", async () => {
  const existing = {
    accessToken: "expired-access-token",
    refreshToken: "keep-this-refresh-token",
    expiresAt: "2026-01-01T00:00:00.000Z",
    scopes: ["scope-a"],
  };
  const refreshed = await refreshGoogleCredential(existing, {
    clientId: "client-id",
    clientSecret: "client-secret",
    now: Date.parse("2026-09-17T00:00:00.000Z"),
    fetchImpl: async () => Response.json({
      access_token: "new-access-token",
      expires_in: 3600,
    }),
  });

  assert.equal(refreshed.accessToken, "new-access-token");
  assert.equal(refreshed.refreshToken, "keep-this-refresh-token");
  assert.deepEqual(refreshed.scopes, ["scope-a"]);
});

test("normalizes Google Ads resources and cost micros", () => {
  assert.deepEqual(normalizeGoogleAdsResource({
    id: "123-456-7890",
    descriptiveName: "Reno Ads",
    currencyCode: "EUR",
    timeZone: "Europe/Brussels",
  }, "999-888-7777"), {
    id: "1234567890",
    name: "Reno Ads",
    customer_id: "1234567890",
    login_customer_id: "9998887777",
    currency: "EUR",
    timezone: "Europe/Brussels",
  });
  assert.equal(costMicrosToCurrency("12345678"), 12.345678);
});

test("normalizes Google Ads daily facts with company and account isolation", () => {
  const insight = normalizeGoogleAdsInsight({
    segments: { date: "2026-09-16" },
    campaign: { id: "campaign-1", name: "Search" },
    adGroup: { id: "group-1", name: "Renovation" },
    adGroupAd: { ad: { id: "ad-1", name: "Ad" } },
    metrics: {
      costMicros: "2500000",
      impressions: "100",
      clicks: "8",
      conversions: "1.5",
    },
  });
  assert.ok(insight);
  assert.deepEqual(googleAdsFactIdentity("company-a", "123-456", insight), {
    companyId: "company-a",
    adAccountId: "google_ads:123456",
    date: "2026-09-16",
    campaignExternalId: "campaign-1",
    adGroupExternalId: "group-1",
    adExternalId: "ad-1",
  });
  assert.notEqual(
    googleAdsFactIdentity("company-a", "123", insight).adAccountId,
    googleAdsFactIdentity("company-b", "456", insight).adAccountId,
  );
});

test("normalizes GA4 daily metrics without inventing conversion events", () => {
  assert.deepEqual(normalizeGa4Row({
    dimensionValues: [{ value: "20260916" }],
    metricValues: [
      { value: "21" },
      { value: "30" },
      { value: "12" },
      { value: "18" },
    ],
  }), {
    date: "2026-09-16",
    users: 21,
    sessions: 30,
    newUsers: 12,
    engagedSessions: 18,
    formSubmissions: 0,
    whatsappClicks: 0,
    phoneClicks: 0,
    quoteRequests: 0,
  });
});

test("Search Console position sum is weighted by impressions", () => {
  assert.deepEqual(normalizeSearchConsoleRow({
    keys: ["2026-09-16", "renovatie", "https://example.test/"],
    clicks: 4,
    impressions: 10,
    position: 3.25,
  }), {
    date: "2026-09-16",
    query: "renovatie",
    page: "https://example.test/",
    clicks: 4,
    impressions: 10,
    positionSum: 32.5,
  });
});

test("normalizes only supported GBP performance metrics", () => {
  const date = { year: 2026, month: 9, day: 16 };
  assert.deepEqual(normalizeGbpTimeSeries([
    { dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", timeSeries: { datedValues: [{ date, value: "10" }] } },
    { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", timeSeries: { datedValues: [{ date, value: "20" }] } },
    { dailyMetric: "WEBSITE_CLICKS", timeSeries: { datedValues: [{ date, value: "3" }] } },
    { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [{ date, value: "2" }] } },
    { dailyMetric: "BUSINESS_DIRECTION_REQUESTS", timeSeries: { datedValues: [{ date, value: "1" }] } },
  ]), [{
    date: "2026-09-16",
    profileViews: 30,
    websiteClicks: 3,
    calls: 2,
    directionRequests: 1,
    messages: 0,
    searches: 0,
    reviews: 0,
    ratingSum: 0,
  }]);
});

test("resource validation rejects inaccessible IDs", () => {
  assert.equal(findAccessibleResource([{ id: "allowed" }], "not-allowed"), null);
});

test("Google Ads replacement scope cannot match Meta or another company", () => {
  const scope = googleAdsReplacementScope("company-a", "google-channel");
  assert.equal(matchesGoogleAdsReplacementScope({ companyId: "company-a", channelId: "google-channel" }, scope), true);
  assert.equal(matchesGoogleAdsReplacementScope({ companyId: "company-a", channelId: "meta-channel" }, scope), false);
  assert.equal(matchesGoogleAdsReplacementScope({ companyId: "company-b", channelId: "google-channel" }, scope), false);
});
