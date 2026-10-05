import type { CompanyDataset } from "@/lib/data/types";
import { manualOverrideSource, normalizeAcquisitionSource, PAID_ACQUISITION_SOURCES } from "@/lib/metrics/business-overview";

export type MonthlySourceSpend = {
  /** source → month (YYYY-MM) → spend */
  bySource: Map<string, Map<string, number>>;
  /** Paid sources whose cost exists only as a YTD total, so no month can be assigned. */
  ytdOnlySources: Set<string>;
};

/**
 * Spend per acquisition source per calendar month, using the same precedence as
 * source economics: monthly manual entries (bank payments) win over synced ad
 * spend for that source; recurring offline spend is added per month it runs.
 */
export function buildMonthlySourceSpend(data: CompanyDataset, today = new Date().toISOString().slice(0, 10)): MonthlySourceSpend {
  const bySource = new Map<string, Map<string, number>>();
  const add = (source: string, month: string, amount: number) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    const months = bySource.get(source) ?? new Map<string, number>();
    months.set(month, (months.get(month) ?? 0) + amount);
    bySource.set(source, months);
  };

  const overrides = data.manualOverrides ?? [];
  const manualMonthly = overrides.filter(item =>
    item.scopeType === "source" && item.fieldKey === "spend" && /^\d{4}-\d{2}$/.test(item.periodKey) && typeof item.value === "number",
  );
  const manualSources = new Set(manualMonthly.map(item => normalizeAcquisitionSource(item.scopeKey)));
  for (const item of manualMonthly) add(normalizeAcquisitionSource(item.scopeKey), item.periodKey, Number(item.value));

  for (const row of data.syncedMonthlySpend ?? []) {
    const source = normalizeAcquisitionSource(row.channel);
    if (!manualSources.has(source)) add(source, row.month, row.spend);
  }

  for (const item of overrides) {
    if (item.scopeType !== "source" || item.fieldKey !== "recurring_spend") continue;
    if (!item.value || typeof item.value !== "object" || Array.isArray(item.value)) continue;
    const value = item.value as Record<string, unknown>;
    const monthly = Number(value.monthly ?? 0);
    const start = typeof value.start === "string" ? value.start.slice(0, 7) : "";
    const end = (typeof value.end === "string" && value.end ? value.end : today).slice(0, 7);
    if (!Number.isFinite(monthly) || monthly <= 0 || !/^\d{4}-\d{2}$/.test(start)) continue;
    const source = manualOverrideSource(item);
    for (let month = start; month <= end && month <= today.slice(0, 7); month = nextMonth(month)) add(source, month, monthly);
  }

  const ytdOnlySources = new Set(
    overrides
      .filter(item => item.scopeType === "source" && item.fieldKey === "spend" && item.periodKey === "ytd" && Number(item.value) > 0)
      .map(item => normalizeAcquisitionSource(item.scopeKey))
      .filter(source => PAID_ACQUISITION_SOURCES.has(source) && !bySource.has(source)),
  );

  return { bySource, ytdOnlySources };
}

export function sourceSpendInMonths(spend: MonthlySourceSpend, source: string, from: string, to: string): number | null {
  if (spend.ytdOnlySources.has(source)) return null;
  let total = 0;
  for (const [month, amount] of spend.bySource.get(source) ?? []) if (month >= from && month <= to) total += amount;
  return total;
}

export function totalSpendInMonths(spend: MonthlySourceSpend, from: string, to: string) {
  let total = 0;
  for (const months of spend.bySource.values()) for (const [month, amount] of months) if (month >= from && month <= to) total += amount;
  return total;
}

export function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  for (let month = from; month <= to; month = nextMonth(month)) months.push(month);
  return months;
}

function nextMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`;
}
