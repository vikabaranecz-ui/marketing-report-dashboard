export type MetaAdAccount = {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
};

export type MetaInsight = {
  date: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  landingPageViews: number;
  platformLeads: number;
};

type MetaAction = { action_type?: unknown; value?: unknown };

export function normalizeMetaAdAccountId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

export function platformLeadCount(actions: unknown) {
  const values = actionValues(actions);

  // Meta can return both an aggregate lead action and its components. Use one
  // clearly identified value in priority order so platform leads are not doubled.
  for (const type of [
    "lead",
    "onsite_conversion.lead_grouped",
    "onsite_conversion.lead",
    "offsite_conversion.fb_pixel_lead",
  ]) {
    if (values.has(type)) return values.get(type) ?? 0;
  }

  return 0;
}

export function landingPageViewCount(actions: unknown) {
  return actionValues(actions).get("landing_page_view") ?? 0;
}

export function normalizeMetaInsight(row: Record<string, unknown>): MetaInsight | null {
  const date = text(row.date_start);
  const campaignId = text(row.campaign_id);
  const adsetId = text(row.adset_id);
  const adId = text(row.ad_id);
  if (!date || !campaignId || !adsetId || !adId) return null;

  return {
    date,
    campaignId,
    campaignName: text(row.campaign_name) || campaignId,
    adsetId,
    adsetName: text(row.adset_name) || adsetId,
    adId,
    adName: text(row.ad_name) || adId,
    spend: nonNegative(row.spend),
    impressions: nonNegative(row.impressions),
    reach: nonNegative(row.reach),
    clicks: nonNegative(row.clicks),
    landingPageViews: landingPageViewCount(row.actions),
    platformLeads: platformLeadCount(row.actions),
  };
}

function actionValues(actions: unknown) {
  const values = new Map<string, number>();
  if (!Array.isArray(actions)) return values;

  for (const action of actions as MetaAction[]) {
    if (typeof action?.action_type !== "string") continue;
    const value = Number(action.value ?? 0);
    if (Number.isFinite(value) && value >= 0) values.set(action.action_type, value);
  }

  return values;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegative(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
