import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMetaAdAccountId,
  normalizeMetaInsight,
  landingPageViewCount,
  platformLeadCount,
} from "../src/lib/integrations/meta/core.ts";

test("normalizes verified Meta ad account identifiers without guessing by name", () => {
  assert.equal(normalizeMetaAdAccountId("902714889384944"), "act_902714889384944");
  assert.equal(normalizeMetaAdAccountId("act_1471543837984653"), "act_1471543837984653");
  assert.equal(normalizeMetaAdAccountId(""), "");
});

test("uses one clearly identified Meta lead action without double counting", () => {
  assert.equal(platformLeadCount([
    { action_type: "lead", value: "4" },
    { action_type: "onsite_conversion.lead_grouped", value: "3" },
  ]), 4);
  assert.equal(platformLeadCount([{ action_type: "link_click", value: "20" }]), 0);
});

test("imports landing-page views only when Meta identifies the action", () => {
  assert.equal(landingPageViewCount([
    { action_type: "landing_page_view", value: "17" },
    { action_type: "link_click", value: "24" },
  ]), 17);
  assert.equal(landingPageViewCount([{ action_type: "link_click", value: "24" }]), 0);
});

test("normalizes one ad-level daily insight row", () => {
  assert.deepEqual(normalizeMetaInsight({
    date_start: "2026-01-31",
    campaign_id: "campaign-1",
    campaign_name: "Campaign",
    adset_id: "adset-1",
    adset_name: "Ad set",
    ad_id: "ad-1",
    ad_name: "Ad",
    spend: "12.34",
    impressions: "1000",
    reach: "800",
    clicks: "25",
    actions: [
      { action_type: "lead", value: "2" },
      { action_type: "landing_page_view", value: "19" },
    ],
  }), {
    date: "2026-01-31",
    campaignId: "campaign-1",
    campaignName: "Campaign",
    adsetId: "adset-1",
    adsetName: "Ad set",
    adId: "ad-1",
    adName: "Ad",
    spend: 12.34,
    impressions: 1000,
    reach: 800,
    clicks: 25,
    landingPageViews: 19,
    platformLeads: 2,
  });
});
