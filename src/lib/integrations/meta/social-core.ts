export type SocialPlatform = "facebook" | "instagram";

export type SocialPostRecord = {
  platform: SocialPlatform;
  accountId: string;
  accountName: string | null;
  externalId: string;
  publishedAt: string;
  postType: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  interactions: number | null;
};

export type SocialAccountSnapshot = {
  platform: SocialPlatform;
  accountId: string;
  accountName: string | null;
  followers: number | null;
};

/** A configured Page wins; otherwise the only Page, otherwise the Page whose name matches the company. */
export function pickSocialPage<T extends { id: string; name: string }>(pages: T[], companyName: string, configuredPageId: string | null) {
  if (configuredPageId) return pages.find(page => page.id === configuredPageId) ?? null;
  if (pages.length === 1) return pages[0];
  const key = compact(companyName);
  return pages.find(page => compact(page.name) === key)
    ?? pages.find(page => key && (compact(page.name).includes(key) || key.includes(compact(page.name))))
    ?? null;
}

/** Reads one metric from an insights edge, accepting both `values` and `total_value` shapes. */
export function readInsightValue(insights: { data?: unknown[] } | undefined, names: string[]) {
  for (const name of names) {
    const row = (insights?.data ?? []).find(item => (item as { name?: unknown }).name === name) as
      | { values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }
      | undefined;
    const raw = row?.values?.[0]?.value ?? row?.total_value?.value;
    const value = Number(raw);
    if (raw !== undefined && raw !== null && Number.isFinite(value)) return value;
  }
  return null;
}

export function socialPostType(platform: SocialPlatform, productOrStatus: string, mediaType = "") {
  const kind = productOrStatus.toUpperCase();
  const media = mediaType.toUpperCase();
  if (platform === "instagram") {
    if (kind === "REELS") return "Reel";
    if (kind === "STORY") return "Story";
    if (media === "CAROUSEL_ALBUM") return "Carousel";
    if (media === "VIDEO") return "Video";
    return "Photo";
  }
  if (kind.includes("VIDEO")) return "Video";
  if (kind.includes("PHOTO")) return "Photo";
  if (kind.includes("SHARED") || kind.includes("LINK")) return "Link";
  return "Post";
}

export function engagementRate(post: Pick<SocialPostRecord, "interactions" | "reach">) {
  return post.reach && post.reach > 0 && post.interactions !== null ? post.interactions / post.reach : null;
}

function compact(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
