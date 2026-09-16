export function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function percentage(numerator: number, denominator: number): number | null {
  const value = safeDivide(numerator, denominator);
  return value === null ? null : value * 100;
}

export type MetricInputs = {
  spend: number;
  leads: number;
  qualified: number;
  visits: number;
  won: number;
  revenue: number;
};

export function calculateKpis(input: MetricInputs) {
  return {
    cpl: safeDivide(input.spend, input.leads),
    qualifiedCpl: safeDivide(input.spend, input.qualified),
    costPerVisit: safeDivide(input.spend, input.visits),
    cac: safeDivide(input.spend, input.won),
    leadToSaleRate: percentage(input.won, input.leads),
    roas: safeDivide(input.revenue, input.spend),
  };
}

export function formatCurrency(value: number | null, compact = false) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function formatNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("nl-BE", { maximumFractionDigits: 1 })}%`;
}
