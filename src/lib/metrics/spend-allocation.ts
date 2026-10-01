export type SpendAllocationWindow = {
  firstDate: string;
  lastDate: string;
};

export function allocateSpendAcrossActiveWindow(
  total: number,
  window: SpendAllocationWindow,
  periodStart: string,
  periodEnd: string,
) {
  if (!Number.isFinite(total) || total < 0) return null;
  const activeStart = laterDate(window.firstDate, periodStart);
  const activeEnd = earlierDate(window.lastDate, periodEnd);
  if (!isDate(window.firstDate) || !isDate(window.lastDate) || !isDate(periodStart) || !isDate(periodEnd)) return null;
  if (window.firstDate > window.lastDate || activeStart > activeEnd) return 0;
  const totalDays = inclusiveDays(window.firstDate, window.lastDate);
  const coveredDays = inclusiveDays(activeStart, activeEnd);
  return totalDays > 0 ? total * coveredDays / totalDays : null;
}

export function inclusiveDays(from: string, to: string) {
  if (!isDate(from) || !isDate(to) || from > to) return 0;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function laterDate(left: string, right: string) {
  return left > right ? left : right;
}

function earlierDate(left: string, right: string) {
  return left < right ? left : right;
}
