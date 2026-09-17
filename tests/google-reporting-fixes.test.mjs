import assert from "node:assert/strict";
import test from "node:test";

import {
  searchConsolePersistenceRow,
  searchConsoleReplacementCompanyId,
  searchConsoleSyncIdentity,
  searchConsoleSyncScope,
} from "../src/lib/integrations/google/core.ts";
import {
  requestGoogleJson,
  retryDelayMilliseconds,
} from "../src/lib/integrations/google/http-core.ts";
import { aggregateGa4WebsiteMetrics } from "../src/lib/metrics/website.ts";

const isoSite = "sc-domain:isoprotech.be";
const renoSite = "sc-domain:renorangers.be";

test("Search Console keeps each company's exact configured resource", () => {
  const iso = searchConsoleSyncScope("company-iso", isoSite);
  const reno = searchConsoleSyncScope("company-reno", renoSite);
  assert.equal(iso.siteUrl, isoSite);
  assert.equal(reno.siteUrl, renoSite);
  assert.notEqual(iso.siteUrl, reno.siteUrl);
});

test("Search Console selectedResourceId is the exact API request resource", () => {
  const identity = searchConsoleSyncIdentity(searchConsoleSyncScope("company-iso", isoSite));
  assert.equal(identity.requestSiteUrl, isoSite);
  assert.equal(identity.selectedResourceId, identity.requestSiteUrl);
});

test("Search Console persistence cannot write another company's rows", () => {
  const scope = searchConsoleSyncScope("company-a", isoSite);
  const row = searchConsolePersistenceRow(scope, {
    date: "2026-09-17",
    query: "isolatie",
    page: "https://isoprotech.be/",
    impressions: 20,
    clicks: 2,
    positionSum: 80,
  });
  assert.equal(row.company_id, "company-a");
  assert.notEqual(row.company_id, "company-b");
});

test("Search Console resync replacement scope matches only its company", () => {
  const companyA = searchConsoleSyncScope("company-a", isoSite);
  const companyB = searchConsoleSyncScope("company-b", renoSite);
  assert.equal(searchConsoleReplacementCompanyId(companyA), "company-a");
  assert.equal(searchConsoleReplacementCompanyId(companyB), "company-b");
  assert.notEqual(searchConsoleReplacementCompanyId(companyA), searchConsoleReplacementCompanyId(companyB));
});

test("GA4 aggregates stored website_metrics for the selected company and range", () => {
  const rows = [
    { companyId: "company-a", date: "2026-09-16", users: 10, sessions: 12, newUsers: 8, engagedSessions: 5 },
    { companyId: "company-a", date: "2026-09-17", users: 20, sessions: 23, newUsers: 14, engagedSessions: 11 },
    { companyId: "company-a", date: "2026-08-01", users: 100, sessions: 120, newUsers: 90, engagedSessions: 70 },
  ];
  assert.deepEqual(aggregateGa4WebsiteMetrics(rows, "company-a", "2026-09-01", "2026-09-30"), {
    rows: 2,
    users: 30,
    sessions: 35,
    newUsers: 22,
    engagedSessions: 16,
  });
});

test("GA4 aggregation cannot leak between companies", () => {
  const rows = [
    { companyId: "company-a", date: "2026-09-17", users: 25, sessions: 30, newUsers: 20, engagedSessions: 15 },
    { companyId: "company-b", date: "2026-09-17", users: 900, sessions: 950, newUsers: 800, engagedSessions: 700 },
  ];
  assert.deepEqual(aggregateGa4WebsiteMetrics(rows, "company-a", "2026-01-01", "2026-09-17"), {
    rows: 1,
    users: 25,
    sessions: 30,
    newUsers: 20,
    engagedSessions: 15,
  });
});

test("Google 403 diagnostics preserve HTTP, canonical status, message and resource", async () => {
  await assert.rejects(
    requestGoogleJson("https://example.test", "secret-token", {
      context: { apiName: "Google Analytics Data API", resource: "property 520935773" },
      fetchImpl: async () => Response.json({
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: "User does not have sufficient permissions",
        },
      }, { status: 403 }),
    }),
    error => {
      assert.match(error.message, /Google Analytics Data API failed: HTTP 403 PERMISSION_DENIED/);
      assert.match(error.message, /User does not have sufficient permissions/);
      assert.match(error.message, /property 520935773/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    },
  );
});

test("Google quota handling retries 429 with bounded backoff", async () => {
  let calls = 0;
  const delays = [];
  const result = await requestGoogleJson("https://example.test", "token", {
    context: { apiName: "Google Business Profile Account Management API", retryQuota: true },
    fetchImpl: async () => {
      calls += 1;
      return calls < 3
        ? Response.json({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }, { status: 429 })
        : Response.json({ accounts: [] });
    },
    sleep: async milliseconds => { delays.push(milliseconds); },
    random: () => 0,
  });
  assert.deepEqual(result, { accounts: [] });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("Google permission 403 is never retried", async () => {
  let calls = 0;
  await assert.rejects(requestGoogleJson("https://example.test", "token", {
    context: { apiName: "Google Business Profile API", retryQuota: true },
    fetchImpl: async () => {
      calls += 1;
      return Response.json({ error: { status: "PERMISSION_DENIED", message: "Access denied" } }, { status: 403 });
    },
    sleep: async () => { throw new Error("403 must not sleep or retry"); },
  }), /PERMISSION_DENIED/);
  assert.equal(calls, 1);
});

test("Google quota retry honors Retry-After", async () => {
  const delays = [];
  let calls = 0;
  await requestGoogleJson("https://example.test", "token", {
    context: { apiName: "Google Business Profile API", retryQuota: true },
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }, { status: 429, headers: { "Retry-After": "2" } })
        : Response.json({ ok: true });
    },
    sleep: async milliseconds => { delays.push(milliseconds); },
  });
  assert.deepEqual(delays, [2000]);
  assert.equal(retryDelayMilliseconds("2", 0), 2000);
});

test("GBP returns a clear zero-quota action after at most three retries", async () => {
  let calls = 0;
  await assert.rejects(requestGoogleJson("https://example.test", "token", {
    context: {
      apiName: "Google Business Profile Account Management API",
      resource: "the authorized Google account",
      retryQuota: true,
      quotaHelp: "If this Cloud project has zero GBP API quota, submit Google's Application for Basic API Access; code cannot enable zero quota.",
    },
    fetchImpl: async () => {
      calls += 1;
      return Response.json({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }, { status: 429 });
    },
    sleep: async () => {},
    random: () => 0,
  }), /zero GBP API quota.*Basic API Access.*code cannot enable zero quota/);
  assert.equal(calls, 4);
});
