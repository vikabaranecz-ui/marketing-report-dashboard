import assert from "node:assert/strict";
import test from "node:test";

import {
  META_REQUIRED_PERMISSIONS,
  metaAdContext,
  parseMetaPermissionRows,
  readMetaSyncSources,
  selectedMetaLeadRecord,
} from "../src/lib/integrations/meta/production-core.ts";

const grantedRows = META_REQUIRED_PERMISSIONS.map(permission => ({ permission, status: "granted" }));

test("parses /me/permissions and reports the exact granted set", () => {
  const result = parseMetaPermissionRows(grantedRows);
  assert.equal(result.status, "Ready");
  assert.deepEqual(result.granted, [...META_REQUIRED_PERMISSIONS]);
  assert.deepEqual(result.missing, []);
  assert.equal(result.leadAdsAvailable, true);
});

test("missing leads_retrieval prevents Lead Ads readiness", () => {
  const result = parseMetaPermissionRows(
    grantedRows.filter(row => row.permission !== "leads_retrieval"),
  );
  assert.equal(result.status, "App Review / Advanced Access required");
  assert.deepEqual(result.missing, ["leads_retrieval"]);
  assert.equal(result.adsInsightsAvailable, true);
  assert.equal(result.leadAdsAvailable, false);
});

test("an explicitly declined Page permission reports missing permissions", () => {
  const rows = grantedRows.map(row => row.permission === "pages_manage_ads"
    ? { ...row, status: "declined" }
    : row);
  const result = parseMetaPermissionRows(rows);
  assert.equal(result.status, "Missing permissions");
  assert.deepEqual(result.missing, ["pages_manage_ads"]);
  assert.equal(result.leadAdsAvailable, false);
});

test("ads_read-only mode still retrieves Ads Insights and skips Lead Ads", async () => {
  let leadCalls = 0;
  const result = await readMetaSyncSources({
    fetchInsights: async () => [{ date: "2026-09-18", spend: 25 }],
    fetchLeads: async () => { leadCalls += 1; return [{ id: "lead" }]; },
    leadAdsAvailable: false,
    unavailableWarning: "Lead Ads permissions are missing.",
  });
  assert.deepEqual(result.insights, [{ date: "2026-09-18", spend: 25 }]);
  assert.equal(result.leads, null);
  assert.equal(result.warning, "Lead Ads permissions are missing.");
  assert.equal(leadCalls, 0);
});

test("selected-account creative supplies exact Page and form identities", () => {
  const ad = metaAdContext({
    id: "selected-ad",
    creative: {
      object_story_spec: {
        page_id: "selected-page",
        link_data: {
          call_to_action: { value: { lead_gen_form_id: "selected-form" } },
        },
      },
    },
  });
  assert.equal(ad?.pageId, "selected-page");
  assert.deepEqual(ad?.formIds, ["selected-form"]);
});

test("an unrelated Page lead is filtered before persistence", () => {
  const selectedAd = metaAdContext({ id: "selected-ad", name: "Selected" });
  assert.ok(selectedAd);
  const record = selectedMetaLeadRecord({
    id: "unrelated-lead",
    ad_id: "other-account-ad",
    field_data: [{ name: "email", values: ["private@example.com"] }],
  }, "other-page", "other-form", new Map([[selectedAd.id, selectedAd]]));
  assert.equal(record, null);
});

test("a selected-account lead is retained for attribution", () => {
  const selectedAd = metaAdContext({
    id: "selected-ad",
    name: "Selected",
    campaign: { id: "campaign-1", name: "Campaign" },
    adset: { id: "adset-1", name: "Ad set" },
    creative: { object_story_spec: { page_id: "selected-page" } },
  });
  assert.ok(selectedAd);
  const record = selectedMetaLeadRecord({
    id: "selected-lead",
    created_time: "2026-09-18T08:00:00Z",
    ad_id: "selected-ad",
    form_id: "selected-form",
    field_data: [{ name: "email", values: ["lead@example.com"] }],
  }, "selected-page", "selected-form", new Map([[selectedAd.id, selectedAd]]));
  assert.equal(record?.id, "selected-lead");
  assert.equal(record?.adExternalId, "selected-ad");
  assert.equal(record?.email, "lead@example.com");
});

test("Lead Ads retrieval failure does not fail completed Ads Insights retrieval", async () => {
  const result = await readMetaSyncSources({
    fetchInsights: async () => [{ date: "2026-09-18", spend: 40 }],
    fetchLeads: async () => { throw new Error("Missing leads_retrieval permission"); },
    leadAdsAvailable: true,
    unavailableWarning: "unused",
  });
  assert.deepEqual(result.insights, [{ date: "2026-09-18", spend: 40 }]);
  assert.equal(result.leads, null);
  assert.match(result.warning, /Missing leads_retrieval permission/);
});
