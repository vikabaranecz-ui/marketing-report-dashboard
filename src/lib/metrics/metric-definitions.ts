export type MetricDefinition = {
  label: string;
  perspective: "acquisition-cohort" | "calendar-activity" | "commercial-ledger";
  record: string;
  dateField: string | null;
  definition: string;
};

/**
 * The authoritative reporting contract. UI labels may be shorter, but pages
 * must not change these record grains or date clocks.
 */
export const metricDefinitions = {
  newLeads: {
    label: "New leads acquired",
    perspective: "acquisition-cohort",
    record: "unique CRM people",
    dateField: "lead acquired date",
    definition: "One person per exact email or normalized phone in the selected acquisition period. Name alone never merges people.",
  },
  offersCreated: {
    label: "Offers created",
    perspective: "calendar-activity",
    record: "ROBAWS offer documents",
    dateField: "quotes.created_at",
    definition: "Each distinct ROBAWS offer document created in the selected calendar period.",
  },
  offersSent: {
    label: "Offers sent",
    perspective: "calendar-activity",
    record: "ROBAWS offer documents",
    dateField: "quotes.sent_at",
    definition: "Each distinct offer with a verified sent timestamp in the selected calendar period. A status is not used as a substitute for a missing timestamp in activity reporting.",
  },
  wonClients: {
    label: "Won clients",
    perspective: "commercial-ledger",
    record: "unique ROBAWS clients",
    dateField: null,
    definition: "Unique ROBAWS clients with project, invoice, invoiced-value, or paid-value evidence. Offer acceptance alone is pending, not won.",
  },
  wonProjects: {
    label: "Projects won",
    perspective: "calendar-activity",
    record: "ROBAWS project rows",
    dateField: "projects.won_at",
    definition: "Distinct ROBAWS projects won in the selected calendar period; multiple projects for one client remain separate.",
  },
  invoicedRevenue: {
    label: "Invoiced revenue",
    perspective: "calendar-activity",
    record: "ROBAWS invoice rows",
    dateField: "commercial_invoices.invoice_date",
    definition: "Invoice value including VAT, net of credits, for invoices dated in the selected calendar period.",
  },
  receivedRevenue: {
    label: "Payments received",
    perspective: "calendar-activity",
    record: "payment transactions",
    dateField: "payment_received_at",
    definition: "Unavailable until ROBAWS supplies payment transaction dates. paid_total attached to an invoice is a current balance snapshot, not cash received in that invoice month.",
  },
  advertisingSpend: {
    label: "Advertising spend",
    perspective: "calendar-activity",
    record: "daily platform facts",
    dateField: "daily_marketing_metrics.date",
    definition: "Sum of idempotent daily ad-level spend facts in the selected calendar period. Missing source cost is unknown, never zero.",
  },
} as const satisfies Record<string, MetricDefinition>;

export function metricDefinition(key: keyof typeof metricDefinitions) {
  return metricDefinitions[key];
}
