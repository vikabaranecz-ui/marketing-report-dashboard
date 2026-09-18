import assert from "node:assert/strict";
import test from "node:test";

import {
  commercialFunnelTotals,
  crmLeadAttributionUpdate,
  deduplicateMetaLeads,
  entityMapping,
  isFacebookSource,
  matchMetaLead,
} from "../src/lib/integrations/meta/lead-attribution-core.ts";

const meta = (overrides = {}) => ({ id: "meta-1", email: "lead@example.com", phone: "+32 471 12 34 56", ...overrides });
const crm = (id, overrides = {}) => ({ id, email: "lead@example.com", phone: "0471 12 34 56", metaLeadId: null, ...overrides });

test("matches exact email and phone before single identifiers", () => {
  assert.deepEqual(matchMetaLead(meta(), [crm("lead-1")]), {
    leadId: "lead-1", method: "EMAIL+PHONE", status: "MATCHED",
  });
});

test("matches a unique normalized email", () => {
  assert.equal(matchMetaLead(meta({ phone: null }), [crm("lead-1")]).method, "EMAIL");
});

test("matches a unique normalized phone", () => {
  assert.equal(matchMetaLead(meta({ email: null }), [crm("lead-1")]).method, "PHONE");
});

test("duplicate email is ambiguous", () => {
  const result = matchMetaLead(meta({ phone: null }), [crm("a"), crm("b")]);
  assert.deepEqual(result, { leadId: null, method: "AMBIGUOUS", status: "AMBIGUOUS" });
});

test("duplicate phone is ambiguous", () => {
  const result = matchMetaLead(meta({ email: null }), [crm("a"), crm("b")]);
  assert.equal(result.status, "AMBIGUOUS");
});

test("name is never used for matching", () => {
  const result = matchMetaLead({ id: "meta-1" }, [{ id: "lead-1", email: null, phone: null }]);
  assert.equal(result.status, "UNMATCHED");
});

test("Meta lead import identity is idempotent", () => {
  const record = { ...meta(), createdTime: "2026-09-01T10:00:00Z", pageId: "p", formId: "f", campaignExternalId: "c", campaignName: "Campaign", adsetExternalId: "s", adsetName: "Set", adExternalId: "a", adName: "Ad" };
  assert.equal(deduplicateMetaLeads([record, { ...record }]).length, 1);
});

test("maps exact external campaign, ad set and ad identifiers", () => {
  const record = { ...meta(), createdTime: "2026-09-01T10:00:00Z", pageId: null, formId: "f", campaignExternalId: "campaign-ext", campaignName: null, adsetExternalId: "set-ext", adsetName: null, adExternalId: "ad-ext", adName: null };
  assert.deepEqual(entityMapping(record, new Map([["campaign-ext", "campaign-db"]]), new Map([["set-ext", "set-db"]]), new Map([["ad-ext", "ad-db"]])), {
    campaignId: "campaign-db", adGroupId: "set-db", adId: "ad-db",
  });
});

test("CRM attribution update preserves source fields", () => {
  const update = crmLeadAttributionUpdate("meta-1", { campaignId: "campaign-db", adGroupId: "set-db", adId: "ad-db" });
  assert.equal("source" in update, false);
  assert.equal("crm_source" in update, false);
  assert.equal(update.attribution_level, "exact_ad");
});

test("unmatched Facebook source remains source-level unattributed", () => {
  assert.equal(isFacebookSource("Facebook Ads"), true);
  assert.equal(matchMetaLead({ id: "meta-1" }, []).status, "UNMATCHED");
});

test("campaign revenue excludes open offers and avoids accepted-offer plus project double counting", () => {
  const totals = commercialFunnelTotals(new Set(["lead-1"]), [
    { id: "open", leadId: "lead-1", status: "opvolgen", valueInclVat: 10_000 },
    { id: "accepted-a", leadId: "lead-1", status: "goedgekeurd", valueInclVat: 20_000 },
    { id: "accepted-b", leadId: "lead-1", status: "gefactureerd", valueInclVat: 5_000 },
  ], [
    { id: "project", leadId: "lead-1", valueInclVat: 22_000, attributionStatus: "EXACT_AFTER_LEAD" },
  ], [
    { id: "invoice", leadId: "lead-1", invoicedInclVat: 15_000, paid: 12_000, attributionStatus: "EXACT_AFTER_LEAD" },
  ]);

  assert.equal(totals.openValue, 10_000);
  assert.equal(totals.wonValue, 22_000);
  assert.equal(totals.projectValue, 22_000);
  assert.equal(totals.pipelineValue, 32_000);
  assert.equal(totals.paid, 12_000);
});
