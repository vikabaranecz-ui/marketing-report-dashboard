import "server-only";

import { fetchAll, GRAPH_ROOT } from "./client";
import { pickSocialPage, readInsightValue, socialPostType, type SocialAccountSnapshot, type SocialPostRecord } from "./social-core";

type MetaPage = { id: string; name: string; accessToken: string; instagramId: string | null };

/**
 * Organic Facebook Page and Instagram professional-account posts for one company.
 * Insight metric names change between Graph API versions, so each request tries
 * the richest metric set first and falls back to smaller ones instead of failing.
 */
export async function fetchMetaSocial(accessToken: string, companyName: string, configuredPageId: string | null, since: string) {
  const pages = await fetchPages(accessToken);
  const page = pickSocialPage(pages, companyName, configuredPageId);
  if (!page) {
    return {
      posts: [] as SocialPostRecord[],
      accounts: [] as SocialAccountSnapshot[],
      warning: pages.length
        ? `No Facebook Page matched "${companyName}". Pages available: ${pages.map(item => item.name).join(", ")}.`
        : "No Facebook Page is available to this Meta connection (pages_show_list).",
      pageName: null as string | null,
    };
  }

  const warnings: string[] = [];
  const posts: SocialPostRecord[] = [];
  const accounts: SocialAccountSnapshot[] = [];

  const facebook = await fetchFacebookPosts(page, since).catch(error => {
    warnings.push(`Facebook posts unavailable: ${message(error)}`);
    return [] as SocialPostRecord[];
  });
  posts.push(...facebook);
  const pageInfo = await fetchNode(`${GRAPH_ROOT}/${page.id}?fields=followers_count,fan_count,name`, page.accessToken).catch(() => null);
  accounts.push({
    platform: "facebook",
    accountId: page.id,
    accountName: page.name,
    followers: numberOrNull(pageInfo?.followers_count) ?? numberOrNull(pageInfo?.fan_count),
  });

  if (page.instagramId) {
    const instagram = await fetchInstagramPosts(page.instagramId, page.accessToken, since).catch(error => {
      warnings.push(`Instagram posts unavailable: ${message(error)}`);
      return [] as SocialPostRecord[];
    });
    posts.push(...instagram);
    const igInfo = await fetchNode(`${GRAPH_ROOT}/${page.instagramId}?fields=followers_count,username`, page.accessToken).catch(() => null);
    accounts.push({
      platform: "instagram",
      accountId: page.instagramId,
      accountName: typeof igInfo?.username === "string" ? igInfo.username : null,
      followers: numberOrNull(igInfo?.followers_count),
    });
  } else {
    warnings.push(`No Instagram account is visible on Facebook Page "${page.name.trim()}". Either the permission instagram_basic is not granted yet, or the Instagram professional account is not linked to this Page.`);
  }

  return { posts, accounts, warning: warnings.length ? warnings.join(" ") : null, pageName: page.name as string | null };
}

async function fetchPages(accessToken: string): Promise<MetaPage[]> {
  const url = new URL(`${GRAPH_ROOT}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id}");
  url.searchParams.set("limit", "200");
  const rows = await fetchAll(url, accessToken);
  return rows.map(row => {
    const ig = row.instagram_business_account as { id?: unknown } | undefined;
    return {
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      accessToken: typeof row.access_token === "string" && row.access_token ? row.access_token : accessToken,
      instagramId: typeof ig?.id === "string" ? ig.id : null,
    };
  }).filter(page => page.id);
}

const FACEBOOK_METRIC_SETS = [
  ["post_total_media_view_unique", "post_media_view", "post_clicks"],
  ["post_impressions_unique", "post_impressions", "post_clicks"],
  ["post_clicks"],
];

async function fetchFacebookPosts(page: MetaPage, since: string): Promise<SocialPostRecord[]> {
  const base = "id,created_time,message,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";
  const rows = await withMetricFallback(FACEBOOK_METRIC_SETS, metrics => {
    const url = new URL(`${GRAPH_ROOT}/${page.id}/posts`);
    url.searchParams.set("fields", metrics.length ? `${base},insights.metric(${metrics.join(",")})` : base);
    url.searchParams.set("since", since);
    url.searchParams.set("limit", "50");
    return fetchAll(url, page.accessToken);
  });
  return rows.map(row => {
    const insights = row.insights as { data?: unknown[] } | undefined;
    const reach = readInsightValue(insights, ["post_total_media_view_unique", "post_impressions_unique"]);
    const views = readInsightValue(insights, ["post_media_view", "post_impressions"]);
    const likes = summaryCount(row.reactions);
    const comments = summaryCount(row.comments);
    const shares = numberOrNull((row.shares as { count?: unknown } | undefined)?.count) ?? 0;
    return {
      platform: "facebook" as const,
      accountId: page.id,
      accountName: page.name,
      externalId: String(row.id),
      publishedAt: String(row.created_time),
      postType: socialPostType("facebook", String(row.status_type ?? "")),
      caption: typeof row.message === "string" ? row.message : null,
      permalink: typeof row.permalink_url === "string" ? row.permalink_url : null,
      thumbnailUrl: typeof row.full_picture === "string" ? row.full_picture : null,
      reach,
      views,
      likes,
      comments,
      shares,
      saves: null,
      clicks: readInsightValue(insights, ["post_clicks"]),
      interactions: (likes ?? 0) + (comments ?? 0) + shares,
    };
  }).filter(post => post.externalId && post.publishedAt);
}

const INSTAGRAM_METRIC_SETS = [
  ["reach", "views", "saved", "shares", "total_interactions"],
  ["reach", "saved", "total_interactions"],
  ["reach"],
];

async function fetchInstagramPosts(instagramId: string, accessToken: string, since: string): Promise<SocialPostRecord[]> {
  const base = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count";
  const rows = await withMetricFallback(INSTAGRAM_METRIC_SETS, metrics => {
    const url = new URL(`${GRAPH_ROOT}/${instagramId}/media`);
    url.searchParams.set("fields", metrics.length ? `${base},insights.metric(${metrics.join(",")})` : base);
    url.searchParams.set("limit", "50");
    return fetchAll(url, accessToken);
  });
  return rows
    .filter(row => String(row.timestamp ?? "").slice(0, 10) >= since)
    .map(row => {
      const insights = row.insights as { data?: unknown[] } | undefined;
      const likes = numberOrNull(row.like_count);
      const comments = numberOrNull(row.comments_count);
      const saves = readInsightValue(insights, ["saved"]);
      const shares = readInsightValue(insights, ["shares"]);
      return {
        platform: "instagram" as const,
        accountId: instagramId,
        accountName: null,
        externalId: String(row.id),
        publishedAt: String(row.timestamp),
        postType: socialPostType("instagram", String(row.media_product_type ?? ""), String(row.media_type ?? "")),
        caption: typeof row.caption === "string" ? row.caption : null,
        permalink: typeof row.permalink === "string" ? row.permalink : null,
        thumbnailUrl: typeof row.thumbnail_url === "string" ? row.thumbnail_url : typeof row.media_url === "string" ? row.media_url : null,
        reach: readInsightValue(insights, ["reach"]),
        views: readInsightValue(insights, ["views"]),
        likes,
        comments,
        shares,
        saves,
        clicks: null,
        interactions: readInsightValue(insights, ["total_interactions"]) ?? (likes ?? 0) + (comments ?? 0) + (saves ?? 0) + (shares ?? 0),
      };
    })
    .filter(post => post.externalId && post.publishedAt);
}

async function withMetricFallback(sets: string[][], run: (metrics: string[]) => Promise<Record<string, unknown>[]>) {
  let lastError: unknown = null;
  for (const metrics of [...sets, []]) {
    try {
      return await run(metrics);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function fetchNode(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Meta Graph API request failed with HTTP ${response.status}.`);
  return body;
}

function summaryCount(value: unknown) {
  return numberOrNull((value as { summary?: { total_count?: unknown } } | undefined)?.summary?.total_count);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
