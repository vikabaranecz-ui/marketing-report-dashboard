"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ExternalLink } from "lucide-react";
import type { CompanyDataset, SocialPost } from "@/lib/data/types";
import { formatNumber, formatPercent } from "@/lib/metrics/kpis";
import { Card, EmptyState, KpiCard, SectionHeader, StatusPill } from "./ui";

type Platform = "all" | "facebook" | "instagram";
type SortKey = "interactions" | "reach" | "engagement" | "newest";

export function SocialPage({ data }: { data: CompanyDataset }) {
  const [platform, setPlatform] = useState<Platform>("all");
  const [sort, setSort] = useState<SortKey>("interactions");
  const [limit, setLimit] = useState(15);
  const [from, to] = data.periodLabel.split(" — ");
  const sync = data.socialSync;

  const yearPosts = useMemo(
    () => (data.socialPosts ?? []).filter(post => platform === "all" || post.platform === platform),
    [data.socialPosts, platform],
  );
  const periodPosts = useMemo(
    () => yearPosts.filter(post => inRange(post.publishedAt, from, to)),
    [yearPosts, from, to],
  );

  const totals = summarize(periodPosts);
  const followers = latestFollowers(data.socialFollowers ?? [], from, to);

  const months = [...yearPosts.reduce((map, post) => {
    const month = post.publishedAt.slice(0, 7);
    map.set(month, [...(map.get(month) ?? []), post]);
    return map;
  }, new Map<string, SocialPost[]>())].sort((a, b) => a[0].localeCompare(b[0]));

  const byType = [...periodPosts.reduce((map, post) => {
    const key = `${platformLabel(post.platform)} · ${post.postType}`;
    map.set(key, [...(map.get(key) ?? []), post]);
    return map;
  }, new Map<string, SocialPost[]>())]
    .map(([type, posts]) => ({ type, ...summarize(posts) }))
    .sort((a, b) => (b.avgEngagement ?? -1) - (a.avgEngagement ?? -1));

  const ranked = [...periodPosts].sort((a, b) => {
    if (sort === "newest") return b.publishedAt.localeCompare(a.publishedAt);
    if (sort === "reach") return (b.reach ?? -1) - (a.reach ?? -1);
    if (sort === "engagement") return (engagement(b) ?? -1) - (engagement(a) ?? -1);
    return (b.interactions ?? -1) - (a.interactions ?? -1);
  });

  const noData = !(data.socialPosts ?? []).length;

  return <div className="space-y-6">
    {(noData || sync?.warning || (sync?.missingPermissions.length ?? 0) > 0) && <div className="callout">
      <AlertCircle size={18}/>
      <div>
        <strong>{noData ? "No organic posts synced yet." : "Social sync needs attention."}</strong>
        <p>
          {sync?.missingPermissions.length
            ? `Reconnect Meta on the Data & Sync page and approve the new permissions (${sync.missingPermissions.join(", ")}). `
            : ""}
          {sync?.warning ? `${sync.warning} ` : ""}
          {noData && !sync?.missingPermissions.length && !sync?.warning ? "Posts appear after the next Meta sync (every 3 hours). " : ""}
          Instagram must be a Business or Creator account linked to the Facebook Page.
          {" "}<Link href="/data-health" className="underline">Open Data &amp; Sync</Link>
        </p>
      </div>
    </div>}

    <div className="flex flex-wrap items-center gap-2">
      {(["all", "facebook", "instagram"] as Platform[]).map(value => <button key={value} type="button" onClick={() => { setPlatform(value); setLimit(15); }} className={value === platform ? "button-primary" : "button-secondary"}>{value === "all" ? "Facebook + Instagram" : platformLabel(value)}</button>)}
      {sync?.pageName && <span className="text-xs text-[var(--muted)]">Page: {sync.pageName}</span>}
    </div>

    <div className="kpi-grid kpi-grid-six border-l border-t border-[var(--line)]">
      <KpiCard label="Posts published" value={formatNumber(totals.posts)} meta={`${totals.facebook} Facebook · ${totals.instagram} Instagram`}/>
      <KpiCard label="Reach" value={formatNumber(totals.reach)} meta="Unique accounts reached, summed per post"/>
      <KpiCard label="Interactions" value={formatNumber(totals.interactions)} meta="Likes, comments, shares, saves"/>
      <KpiCard label="Engagement rate" value={formatPercent(totals.engagementRate === null ? null : totals.engagementRate * 100)} meta="Interactions ÷ reach"/>
      <KpiCard label="Facebook followers" value={formatNumber(followers.facebook.latest)} meta={followerMeta(followers.facebook)}/>
      <KpiCard label="Instagram followers" value={formatNumber(followers.instagram.latest)} meta={followerMeta(followers.instagram)}/>
    </div>

    <Card className="p-5">
      <SectionHeader title="Posts per month" description="Whole year of the selected period, so posting rhythm stays visible when one month is selected."/>
      {months.length ? <div className="table-scroll"><table><thead><tr><th>Month</th><th>Posts</th><th>Facebook</th><th>Instagram</th><th>Reach</th><th>Interactions</th><th>Engagement rate</th><th>Best post</th></tr></thead><tbody>
        {months.map(([month, posts]) => {
          const summary = summarize(posts);
          const best = [...posts].sort((a, b) => (b.interactions ?? -1) - (a.interactions ?? -1))[0];
          return <tr key={month}><td className="font-semibold">{monthName(month)}</td><td>{summary.posts}</td><td>{summary.facebook}</td><td>{summary.instagram}</td><td>{formatNumber(summary.reach)}</td><td>{formatNumber(summary.interactions)}</td><td>{formatPercent(summary.engagementRate === null ? null : summary.engagementRate * 100)}</td><td>{best ? <PostLink post={best}/> : "—"}</td></tr>;
        })}
      </tbody></table></div> : <EmptyState title="No posts in this year yet" body="Posts appear after the Meta connection has the social permissions and the next sync has run."/>}
    </Card>

    <Card className="p-5">
      <SectionHeader title="What works best · by post type" description="Selected period. Average per post; engagement rate = interactions ÷ reach."/>
      {byType.length ? <div className="table-scroll"><table><thead><tr><th>Type</th><th>Posts</th><th>Avg reach</th><th>Avg interactions</th><th>Avg engagement rate</th></tr></thead><tbody>
        {byType.map(row => <tr key={row.type}><td className="font-semibold">{row.type}</td><td>{row.posts}</td><td>{formatNumber(row.avgReach)}</td><td>{formatNumber(row.avgInteractions)}</td><td>{formatPercent(row.avgEngagement === null ? null : row.avgEngagement * 100)}</td></tr>)}
      </tbody></table></div> : <EmptyState title="No posts in this period"/>}
    </Card>

    <Card className="p-5">
      <SectionHeader
        title="Posts ranked"
        description={`${periodPosts.length} posts in ${data.periodLabel}.`}
        action={<select value={sort} onChange={event => setSort(event.target.value as SortKey)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
          <option value="interactions">Most interactions</option>
          <option value="engagement">Highest engagement rate</option>
          <option value="reach">Highest reach</option>
          <option value="newest">Newest</option>
        </select>}
      />
      {ranked.length ? <div className="table-scroll"><table><thead><tr><th>Post</th><th>Platform</th><th>Type</th><th>Date</th><th>Reach</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th><th>Saves</th><th>Interactions</th><th>Engagement</th></tr></thead><tbody>
        {ranked.slice(0, limit).map(post => <tr key={post.id}>
          <td className="max-w-[340px]"><div className="flex items-start gap-3">{post.thumbnailUrl && /* eslint-disable-line @next/next/no-img-element -- remote Meta CDN thumbnails */ <img src={post.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover"/>}<PostLink post={post}/></div></td>
          <td><StatusPill tone={post.platform === "instagram" ? "accent" : "neutral"}>{platformLabel(post.platform)}</StatusPill></td>
          <td>{post.postType}</td>
          <td>{shortDate(post.publishedAt)}</td>
          <td>{formatNumber(post.reach)}</td>
          <td>{formatNumber(post.views)}</td>
          <td>{formatNumber(post.likes)}</td>
          <td>{formatNumber(post.comments)}</td>
          <td>{formatNumber(post.shares)}</td>
          <td>{formatNumber(post.saves)}</td>
          <td className="font-semibold">{formatNumber(post.interactions)}</td>
          <td>{formatPercent(engagement(post) === null ? null : (engagement(post) as number) * 100)}</td>
        </tr>)}
      </tbody></table></div> : <EmptyState title="No posts in this period"/>}
      {ranked.length > limit && <div className="mt-4 flex justify-center"><button type="button" className="button-secondary" onClick={() => setLimit(value => value + 15)}>Show 15 more</button></div>}
    </Card>
  </div>;
}

function PostLink({ post }: { post: SocialPost }) {
  const text = post.caption.trim() ? truncate(post.caption.trim(), 90) : `${post.postType} without caption`;
  return post.permalink
    ? <a href={post.permalink} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 hover:underline">{text}<ExternalLink size={12} className="mt-1 shrink-0"/></a>
    : <span>{text}</span>;
}

function summarize(posts: SocialPost[]) {
  const reach = posts.reduce((sum, post) => sum + (post.reach ?? 0), 0);
  const interactions = posts.reduce((sum, post) => sum + (post.interactions ?? 0), 0);
  const withReach = posts.filter(post => post.reach !== null && post.reach > 0);
  const rates = withReach.map(engagement).filter((value): value is number => value !== null);
  return {
    posts: posts.length,
    facebook: posts.filter(post => post.platform === "facebook").length,
    instagram: posts.filter(post => post.platform === "instagram").length,
    reach,
    interactions,
    engagementRate: reach > 0 ? interactions / reach : null,
    avgReach: withReach.length ? reach / withReach.length : null,
    avgInteractions: posts.length ? interactions / posts.length : null,
    avgEngagement: rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : null,
  };
}

function engagement(post: SocialPost) {
  return post.reach && post.reach > 0 && post.interactions !== null ? post.interactions / post.reach : null;
}

function latestFollowers(rows: NonNullable<CompanyDataset["socialFollowers"]>, from: string, to: string) {
  const pick = (platform: "facebook" | "instagram") => {
    const series = rows.filter(row => row.platform === platform).sort((a, b) => a.date.localeCompare(b.date));
    const inPeriod = series.filter(row => row.date >= from && row.date <= to);
    const latest = (inPeriod.at(-1) ?? series.at(-1))?.followers ?? null;
    const first = inPeriod[0]?.followers ?? null;
    return { latest, change: latest !== null && first !== null && inPeriod.length > 1 ? latest - first : null, since: inPeriod[0]?.date ?? null };
  };
  return { facebook: pick("facebook"), instagram: pick("instagram") };
}

function followerMeta(value: { change: number | null; since: string | null }) {
  if (value.change === null) return "Tracked daily from the first sync";
  return `${value.change >= 0 ? "+" : ""}${formatNumber(value.change)} since ${shortDate(value.since ?? "")}`;
}

function inRange(value: string, from: string, to: string) {
  const day = value.slice(0, 10);
  return Boolean(day && from && to && day >= from && day <= to);
}

function platformLabel(value: "facebook" | "instagram") {
  return value === "instagram" ? "Instagram" : "Facebook";
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function monthName(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function shortDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("nl-BE", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Brussels" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}
