import type { CommercialClient } from "@/lib/data/types";

/**
 * Canonical realized-client rule for management reporting.
 *
 * A ROBAWS client is considered won/realized when there is commercial execution
 * evidence: at least one project, at least one invoice, invoiced value or paid value.
 *
 * Accepted-only records without a project/invoice remain pending and must not be used
 * as won-client denominators for CAC or source performance.
 */
export function isWonClient(client: CommercialClient) {
  return client.projectCount > 0
    || client.invoiceCount > 0
    || client.invoicedTotal > 0
    || client.paidTotal > 0;
}

export function isProjectBackedClient(client: CommercialClient) {
  return client.projectCount > 0;
}

export function isAcceptedPendingClient(client: CommercialClient) {
  return client.commercialStatus === "CLIENT_WON"
    && !isWonClient(client)
    && client.acceptedOfferTotal > 0;
}
