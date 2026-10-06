import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { credentialStore } from "./credentials";
import { brusselsDate, storeSocialResults } from "./meta-social-sync";
import { readInsightValue, socialPostType, type SocialAccountSnapshot, type SocialPostRecord } from "./meta/social-core";

// Instagram API with Instagram Login tokens start with "IG" and use graph.instagram.com.
// Facebook Login tokens ("EAA…") reach the same Instagram account through graph.facebook.com.
const IG_ROOT = "https://graph.instagram.com/v26.0";
const FB_ROOT = "https://graph.facebook.com/v26.0";

function apiRoot(token: string) {
  return token.startsWith("IG") ? IG_ROOT : FB_ROOT;
}

/** Removes quotes, whitespace and line breaks that are easy to paste into an environment variable. */
export function cleanToken(value: string | undefined | null) {
  return String(value ?? "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, "");
}
const SYNC_FROM = "2026-01-01";
const REFRESH_WHEN_DAYS_LEFT = 20;

export type InstagramSyncResult = {
  recordsImported: number;
  socialPostsImported: number;
  socialPageName: string | null;
  socialWarning: string | null;
};

/**
 * Organic Instagram posts for the account configured in INSTAGRAM_ACCOUNT_ID.
 * The starting token comes from INSTAGRAM_ACCESS_TOKEN; refreshed tokens are kept
 * in the credential vault so the 60-day token never expires while syncs run.
 */
export async function syncInstagramProvider(connectionId: string, companyId: string): Promise<InstagramSyncResult> {
  const accountId = cleanToken(process.env.INSTAGRAM_ACCOUNT_ID);
  if (!accountId) throw new Error("INSTAGRAM_ACCOUNT_ID is not configured.");
  const accessToken = await currentToken(connectionId);
  const root = apiRoot(accessToken);

  const warnings: string[] = [];
  const profile = await getJson(`${root}/${accountId}?fields=username,followers_count,media_count`, accessToken);
  const username = typeof profile.username === "string" ? profile.username : null;
  const posts = await fetchInstagramMedia(root, accountId, accessToken, username, warnings);
  const accounts: SocialAccountSnapshot[] = [{
    platform: "instagram",
    accountId,
    accountName: username,
    followers: numberOrNull(profile.followers_count),
  }];

  const admin = createSupabaseAdminClient();
  await storeSocialResults(admin, companyId, posts, accounts, brusselsDate(new Date()));
  return {
    recordsImported: posts.length,
    socialPostsImported: posts.length,
    socialPageName: username ? `@${username}` : null,
    socialWarning: warnings.length ? warnings.join(" ") : null,
  };
}

async function currentToken(connectionId: string) {
  const envToken = cleanToken(process.env.INSTAGRAM_ACCESS_TOKEN);
  // A refreshed token in the vault is only used while it descends from the current
  // INSTAGRAM_ACCESS_TOKEN; pasting a new token in Vercel always takes over.
  const source = envToken ? `env:${createHash("sha256").update(envToken).digest("hex").slice(0, 16)}` : "";
  const vaulted = await credentialStore.read(connectionId, "instagram").catch(() => null);
  const stored = vaulted && (!source || vaulted.scopes.includes(source)) ? vaulted : null;
  const token = stored?.accessToken || envToken;
  if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN is not configured.");
  // Only Instagram Login tokens use the ig_refresh_token flow.
  if (!token.startsWith("IG")) return token;

  const expiresAt = stored?.expiresAt ? Date.parse(stored.expiresAt) : NaN;
  const daysLeft = Number.isFinite(expiresAt) ? (expiresAt - Date.now()) / 86_400_000 : 0;
  if (daysLeft > REFRESH_WHEN_DAYS_LEFT) return token;

  // Long-lived Instagram tokens can be refreshed once they are at least 24 hours old.
  try {
    const refreshed = await getJson(`${IG_ROOT.replace(/\/v[\d.]+$/, "")}/refresh_access_token?grant_type=ig_refresh_token`, token);
    if (typeof refreshed.access_token === "string" && refreshed.access_token) {
      const seconds = Number(refreshed.expires_in ?? 0);
      await credentialStore.write(connectionId, "instagram", {
        accessToken: refreshed.access_token,
        expiresAt: new Date(Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60 * 86_400) * 1000).toISOString(),
        scopes: source ? [source] : [],
      });
      return refreshed.access_token;
    }
  } catch {
    // A token younger than 24 hours cannot be refreshed yet; keep using it.
  }
  return token;
}

const METRIC_SETS = [
  ["reach", "views", "saved", "shares", "total_interactions"],
  ["reach", "saved", "shares", "total_interactions"],
  ["reach"],
];

async function fetchInstagramMedia(root: string, accountId: string, accessToken: string, username: string | null, warnings: string[]) {
  const base = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count";
  let rows: Record<string, unknown>[] | null = null;
  for (const metrics of METRIC_SETS) {
    try {
      rows = await getAll(`${root}/${accountId}/media?fields=${base},insights.metric(${metrics.join(",")})&limit=50`, accessToken);
      break;
    } catch {
      // try the next, smaller metric set
    }
  }
  if (!rows) {
    rows = await getAll(`${root}/${accountId}/media?fields=${base}&limit=50`, accessToken);
    warnings.push("Post statistics (reach, saves, shares) were unavailable; check the instagram_business_manage_insights permission.");
  }

  return rows
    .filter(row => String(row.timestamp ?? "").slice(0, 10) >= SYNC_FROM)
    .map((row): SocialPostRecord => {
      const insights = row.insights as { data?: unknown[] } | undefined;
      const likes = numberOrNull(row.like_count);
      const comments = numberOrNull(row.comments_count);
      const saves = readInsightValue(insights, ["saved"]);
      const shares = readInsightValue(insights, ["shares"]);
      return {
        platform: "instagram",
        accountId,
        accountName: username,
        externalId: String(row.id ?? ""),
        publishedAt: String(row.timestamp ?? ""),
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

async function getAll(url: string, accessToken: string) {
  const rows: Record<string, unknown>[] = [];
  let next: string | null = url;
  for (let page = 0; next && page < 40; page += 1) {
    const body = await getJson(next, accessToken);
    rows.push(...((body.data as Record<string, unknown>[] | undefined) ?? []));
    const paging = body.paging as { next?: string } | undefined;
    next = paging?.next ?? null;
  }
  return rows;
}

async function getJson(url: string, accessToken: string) {
  const target = new URL(url);
  if (!target.searchParams.has("access_token")) target.searchParams.set("access_token", accessToken);
  const response = await fetch(target, { cache: "no-store" });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = body.error as { message?: string } | undefined;
    const hint = /parse access token/i.test(error?.message ?? "")
      ? " Check INSTAGRAM_ACCESS_TOKEN in Vercel: paste only the token (starts with IGAA or EAA), without quotes or spaces, then redeploy."
      : "";
    throw new Error(`Instagram API request failed with HTTP ${response.status}.${error?.message ? ` ${error.message}` : ""}${hint}`);
  }
  return body;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed;
}
