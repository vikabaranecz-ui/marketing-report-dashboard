import "server-only";
import type { SyncWindow } from "./types";

const DAY = 86_400_000;

export function buildSyncWindow(lastSuccessfulSync: string | null, now = new Date()): SyncWindow & { mode: "initial" | "incremental" } {
  const to = isoDate(now);
  if (!lastSuccessfulSync) return { mode: "initial", from: isoDate(new Date(now.getTime() - 90 * DAY)), to };
  const last = new Date(lastSuccessfulSync);
  const safeLast = Number.isNaN(last.getTime()) ? new Date(now.getTime() - 90 * DAY) : last;
  return { mode: "incremental", from: isoDate(new Date(safeLast.getTime() - DAY)), to };
}

function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
