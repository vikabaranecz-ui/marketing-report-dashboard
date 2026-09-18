export type MetaLeadIdentity = {
  id: string;
  email?: string | null;
  phone?: string | null;
};

export type CrmLeadIdentity = {
  id: string;
  email?: string | null;
  phone?: string | null;
  metaLeadId?: string | null;
};

export type MetaLeadMatch = {
  leadId: string | null;
  method: "META_LEAD_ID" | "EMAIL+PHONE" | "EMAIL" | "PHONE" | "NONE" | "AMBIGUOUS";
  status: "MATCHED" | "UNMATCHED" | "AMBIGUOUS";
};

export type MetaLeadRecord = MetaLeadIdentity & {
  createdTime: string;
  pageId: string | null;
  formId: string | null;
  campaignExternalId: string | null;
  campaignName: string | null;
  adsetExternalId: string | null;
  adsetName: string | null;
  adExternalId: string | null;
  adName: string | null;
};

export type EntityMapping = {
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
};

export function normalizeMetaEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeMetaPhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("320")) digits = `32${digits.slice(3)}`;
  if (digits.startsWith("04") && digits.length === 10) digits = `32${digits.slice(1)}`;
  if (digits.startsWith("4") && digits.length === 9) digits = `32${digits}`;
  return digits;
}

export function matchMetaLead(
  metaLead: MetaLeadIdentity,
  crmLeads: CrmLeadIdentity[],
): MetaLeadMatch {
  const exactMeta = crmLeads.filter(lead => clean(lead.metaLeadId) === clean(metaLead.id));
  if (exactMeta.length === 1) return matched(exactMeta[0].id, "META_LEAD_ID");
  if (exactMeta.length > 1) return ambiguous();

  const eligible = crmLeads.filter(lead => {
    const claimed = clean(lead.metaLeadId);
    return !claimed || claimed === clean(metaLead.id);
  });
  const email = normalizeMetaEmail(metaLead.email);
  const phone = normalizeMetaPhone(metaLead.phone);
  const emailCandidates = email
    ? eligible.filter(lead => normalizeMetaEmail(lead.email) === email)
    : [];
  const phoneCandidates = phone
    ? eligible.filter(lead => normalizeMetaPhone(lead.phone) === phone)
    : [];

  if (email && phone) {
    const phoneIds = new Set(phoneCandidates.map(lead => lead.id));
    const intersection = emailCandidates.filter(lead => phoneIds.has(lead.id));
    if (intersection.length === 1) return matched(intersection[0].id, "EMAIL+PHONE");
    if (intersection.length > 1) return ambiguous();
    if (emailCandidates.length && phoneCandidates.length) return ambiguous();
  }

  if (emailCandidates.length === 1) return matched(emailCandidates[0].id, "EMAIL");
  if (emailCandidates.length > 1) return ambiguous();
  if (phoneCandidates.length === 1) return matched(phoneCandidates[0].id, "PHONE");
  if (phoneCandidates.length > 1) return ambiguous();
  return { leadId: null, method: "NONE", status: "UNMATCHED" };
}

export function deduplicateMetaLeads(records: MetaLeadRecord[]) {
  return [...new Map(records.map(record => [record.id, record])).values()]
    .sort((a, b) => a.createdTime.localeCompare(b.createdTime) || a.id.localeCompare(b.id));
}

export function entityMapping(
  lead: MetaLeadRecord,
  campaignIds: Map<string, string>,
  adGroupIds: Map<string, string>,
  adIds: Map<string, string>,
): EntityMapping {
  return {
    campaignId: lead.campaignExternalId
      ? campaignIds.get(lead.campaignExternalId) ?? null
      : null,
    adGroupId: lead.adsetExternalId
      ? adGroupIds.get(lead.adsetExternalId) ?? null
      : null,
    adId: lead.adExternalId
      ? adIds.get(lead.adExternalId) ?? null
      : null,
  };
}

export function crmLeadAttributionUpdate(
  metaLeadId: string,
  mapping: EntityMapping,
) {
  return {
    meta_lead_id: metaLeadId,
    ...(mapping.campaignId ? { campaign_id: mapping.campaignId } : {}),
    ...(mapping.adId ? { ad_id: mapping.adId } : {}),
    ...(mapping.adId
      ? { attribution_level: "exact_ad" }
      : mapping.campaignId
        ? { attribution_level: "exact_campaign" }
        : {}),
  };
}

export type FunnelQuote = {
  id: string;
  leadId: string;
  status: string | null;
  valueInclVat: number;
};

export type FunnelProject = {
  id: string;
  leadId: string;
  valueInclVat: number;
  attributionStatus?: string | null;
};

export type FunnelInvoice = {
  id: string;
  leadId: string;
  invoicedInclVat: number;
  paid: number;
  attributionStatus?: string | null;
};

export function commercialFunnelTotals(
  leadIds: Set<string>,
  quotes: FunnelQuote[],
  projects: FunnelProject[],
  invoices: FunnelInvoice[],
) {
  const matchedQuotes = quotes.filter(quote => leadIds.has(quote.leadId));
  const matchedProjects = projects.filter(project =>
    leadIds.has(project.leadId) && isAttributable(project.attributionStatus));
  const matchedInvoices = invoices.filter(invoice =>
    leadIds.has(invoice.leadId) && isAttributable(invoice.attributionStatus));
  const openQuotes = matchedQuotes.filter(quote => offerOutcome(quote.status) === "OPEN");
  const acceptedQuotes = matchedQuotes.filter(quote => offerOutcome(quote.status) === "ACCEPTED");
  const rejectedQuotes = matchedQuotes.filter(quote => offerOutcome(quote.status) === "REJECTED");
  const projectValueByLead = sumByLead(matchedProjects, row => row.valueInclVat);
  const acceptedQuoteValueByLead = sumByLead(acceptedQuotes, row => row.valueInclVat);
  const wonValue = [...leadIds].reduce((total, leadId) =>
    total + (projectValueByLead.get(leadId) ?? acceptedQuoteValueByLead.get(leadId) ?? 0), 0);
  const openValue = openQuotes.reduce((total, quote) => total + quote.valueInclVat, 0);

  return {
    offers: matchedQuotes.length,
    openOffers: openQuotes.length,
    viewedOffers: matchedQuotes.filter(quote => normalizeStatus(quote.status) === "gelezen").length,
    rejectedOffers: rejectedQuotes.length,
    acceptedOffers: acceptedQuotes.length,
    openValue,
    wonValue,
    pipelineValue: openValue + wonValue,
    projects: matchedProjects.length,
    projectValue: matchedProjects.reduce((total, project) => total + project.valueInclVat, 0),
    invoiced: matchedInvoices.reduce((total, invoice) => total + invoice.invoicedInclVat, 0),
    paid: matchedInvoices.reduce((total, invoice) => total + invoice.paid, 0),
  };
}

export function isFacebookSource(source: string | null | undefined) {
  const value = clean(source);
  return value.includes("facebook") || value.includes("meta") || value.includes("instagram");
}

function matched(leadId: string, method: MetaLeadMatch["method"]): MetaLeadMatch {
  return { leadId, method, status: "MATCHED" };
}

function ambiguous(): MetaLeadMatch {
  return { leadId: null, method: "AMBIGUOUS", status: "AMBIGUOUS" };
}

function clean(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeStatus(value: unknown) {
  return clean(value);
}

function offerOutcome(status: string | null) {
  const value = normalizeStatus(status);
  if (["goedgekeurd", "gefactureerd", "deelfactuur", "accepted", "approved"].includes(value)) return "ACCEPTED";
  if (["afgekeurd", "rejected", "declined"].includes(value)) return "REJECTED";
  return "OPEN";
}

function isAttributable(status: string | null | undefined) {
  return !clean(status).includes("date_conflict");
}

function sumByLead<T extends { leadId: string }>(rows: T[], value: (row: T) => number) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.leadId, (totals.get(row.leadId) ?? 0) + value(row));
  return totals;
}
