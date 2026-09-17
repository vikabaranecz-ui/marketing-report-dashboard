export type WebsiteMetricFact = {
  companyId: string;
  date: string;
  users: number;
  sessions: number;
  newUsers: number;
  engagedSessions: number;
};

export function aggregateGa4WebsiteMetrics(
  rows: WebsiteMetricFact[],
  companyId: string,
  from: string,
  to: string,
) {
  return rows.reduce((total, row) => {
    if (row.companyId !== companyId || row.date < from || row.date > to) return total;
    total.rows += 1;
    total.users += nonNegative(row.users);
    total.sessions += nonNegative(row.sessions);
    total.newUsers += nonNegative(row.newUsers);
    total.engagedSessions += nonNegative(row.engagedSessions);
    return total;
  }, { rows: 0, users: 0, sessions: 0, newUsers: 0, engagedSessions: 0 });
}

function nonNegative(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
