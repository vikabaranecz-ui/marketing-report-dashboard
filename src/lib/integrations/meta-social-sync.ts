import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { credentialStore } from "./credentials";
import { fetchMetaSocial } from "./meta/social";
import type { ConnectionConfiguration } from "./types";

const SOCIAL_SYNC_FROM = "2026-01-01";

export type MetaSocialSyncResult = {
  recordsImported: number;
  socialPostsImported: number;
  socialPageName: string | null;
  socialWarning: string | null;
};

/** Organic Facebook Page + Instagram posts, using the separate "posts" Meta app connection. */
export async function syncMetaSocialProvider(
  connectionId: string,
  companyId: string,
  configuration: ConnectionConfiguration,
): Promise<MetaSocialSyncResult> {
  const credential = await credentialStore.read(connectionId, "meta_social");
  if (!credential?.accessToken) {
    throw new Error("Facebook & Instagram posts authorization is missing. Connect it on Data & Sync.");
  }
  const admin = createSupabaseAdminClient();
  const company = await admin.from("companies").select("name").eq("id", companyId).single();
  if (company.error) throw new Error(`Unable to load the reporting company: ${company.error.message}`);

  const social = await syncMetaSocialPosts(
    admin,
    companyId,
    String(company.data.name ?? ""),
    credential.accessToken,
    typeof configuration.social_page_id === "string" ? configuration.social_page_id : null,
    brusselsDate(new Date()),
  );
  return {
    recordsImported: social.imported,
    socialPostsImported: social.imported,
    socialPageName: social.pageName,
    socialWarning: social.warning,
  };
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function syncMetaSocialPosts(
  admin: Admin,
  companyId: string,
  companyName: string,
  accessToken: string,
  configuredPageId: string | null,
  today: string,
) {
  const result = await fetchMetaSocial(accessToken, companyName, configuredPageId, SOCIAL_SYNC_FROM);
  const syncedAt = new Date().toISOString();
  for (let index = 0; index < result.posts.length; index += 200) {
    const upsert = await admin.from("social_posts").upsert(result.posts.slice(index, index + 200).map(post => ({
      company_id: companyId,
      platform: post.platform,
      account_id: post.accountId,
      account_name: post.accountName,
      external_id: post.externalId,
      published_at: post.publishedAt,
      post_type: post.postType,
      caption: post.caption,
      permalink: post.permalink,
      thumbnail_url: post.thumbnailUrl,
      reach: post.reach,
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      saves: post.saves,
      clicks: post.clicks,
      interactions: post.interactions,
      synced_at: syncedAt,
    })), { onConflict: "company_id,platform,external_id" });
    if (upsert.error) throw new Error(`Unable to store social posts: ${upsert.error.message}`);
  }
  const snapshots = result.accounts.filter(account => account.followers !== null);
  if (snapshots.length) {
    const upsert = await admin.from("social_account_daily").upsert(snapshots.map(account => ({
      company_id: companyId,
      platform: account.platform,
      account_id: account.accountId,
      account_name: account.accountName,
      date: today,
      followers: account.followers,
      synced_at: syncedAt,
    })), { onConflict: "company_id,platform,account_id,date" });
    if (upsert.error) throw new Error(`Unable to store social follower counts: ${upsert.error.message}`);
  }
  return { imported: result.posts.length, pageName: result.pageName, warning: result.warning };
}


function brusselsDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
