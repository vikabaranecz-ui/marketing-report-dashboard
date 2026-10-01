type AcquiredRecord = { acquired: string | null };

export function filterPaybackRecordsForPeriod<T extends AcquiredRecord>(
  records: T[],
  periodKey: string,
  periodLabel: string,
) {
  if (periodKey === "ytd") return records;

  const [from, to] = periodLabel.split(" — ");
  if (!isIsoDate(from) || !isIsoDate(to)) return [];

  return records.filter(record => {
    const acquired = record.acquired?.slice(0, 10) ?? "";
    return acquired >= from && acquired <= to;
  });
}

function isIsoDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
