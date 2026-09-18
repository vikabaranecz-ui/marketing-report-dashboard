import type { CommercialAppointment, CommercialOffer, CommercialProject, CompanyDataset, Lead } from "@/lib/data/types";

export type JourneyStage = "new" | "qualified" | "visit" | "offer" | "accepted" | "signed" | "verified" | "lost";

export const journeyStageMeta: Array<{ key: JourneyStage; label: string; description: string }> = [
  { key: "new", label: "New lead", description: "Received, not yet qualified" },
  { key: "qualified", label: "Qualified", description: "Relevant lead ready for sales" },
  { key: "visit", label: "Visit", description: "Visit booked or completed" },
  { key: "offer", label: "Offer sent", description: "ROBAWS offer exists and is still open" },
  { key: "accepted", label: "Offer accepted", description: "Offer accepted, not yet commercially verified" },
  { key: "signed", label: "CRM signed", description: "CRM says signed, project not yet commercially verified" },
  { key: "verified", label: "Verified project", description: "Commercial project verified" },
  { key: "lost", label: "Lost / not relevant", description: "Rejected, lost or explicitly not relevant" },
];

export type JourneyRow = {
  lead: Lead;
  stage: JourneyStage;
  appointments: CommercialAppointment[];
  offers: CommercialOffer[];
  latestOffer: CommercialOffer | null;
  projects: CommercialProject[];
  offerValue: number;
  openOfferValue: number;
  acceptedOfferValue: number;
  projectValue: number;
  hasVisit: boolean;
  isSigned: boolean;
  isNotRelevant: boolean;
  lostReason: string;
};

export type FunnelSummary = {
  leads: number;
  uniquePeople: number;
  qualified: number;
  visits: number;
  offersSent: number;
  quotedValue: number;
  openOffers: number;
  openPipelineValue: number;
  acceptedOffers: number;
  acceptedOfferValue: number;
  crmSigned: number;
  verifiedProjects: number;
  verifiedRevenue: number;
};

const DATE_CONFLICT = "DATE_CONFLICT";

function hasDateConflict(value: string | null | undefined) {
  return String(value ?? "").toUpperCase().includes(DATE_CONFLICT);
}

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isExplicitlyNotRelevant(lead: Lead) {
  const status = normalized(lead.crmStatus);
  return [
    "verkeerde regio",
    "wrong region",
    "onjuiste contactgegevens",
    "verkeerde nummer",
    "niet interessant",
    "geen interesse",
  ].includes(status);
}

function isSigned(lead: Lead) {
  const status = normalized(lead.crmStatus);
  return status === "signed" || status.includes("contract signed") || status.includes("closed won");
}

function hasVisitEvidence(data: CompanyDataset, lead: Lead) {
  const status = normalized(lead.crmStatus);
  const stage = normalized(lead.stage);
  return (data.appointmentLeadIds ?? []).includes(lead.id)
    || stage.includes("visit")
    || ["visited offerte to be done", "offer sent", "email offerte", "signed", "offerte afgekeurd"].includes(status);
}

function isQualified(lead: Lead) {
  const stage = normalized(lead.stage);
  return !isExplicitlyNotRelevant(lead) && (
    lead.quality === "A"
    || lead.quality === "B"
    || stage.includes("qualified")
    || stage.includes("visit")
    || stage.includes("quote")
    || stage.includes("won")
  );
}

function latestOffer(offers: CommercialOffer[]) {
  return [...offers].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

function uniquePersonCount(leads: Lead[]) {
  const identities = new Set<string>();
  for (const lead of leads) {
    const email = lead.email.trim().toLowerCase();
    const phone = lead.phone.replace(/\D/g, "");
    const name = lead.name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    identities.add(email ? `email:${email}` : phone.length >= 8 ? `phone:${phone}` : `name:${name || lead.id}`);
  }
  return identities.size;
}

export function buildJourneyRows(data: CompanyDataset): JourneyRow[] {
  const appointments = data.commercialAppointments ?? [];
  const offers = (data.commercialOffers ?? []).filter(item => !hasDateConflict(item.attributionStatus));
  const projects = (data.commercialProjects ?? []).filter(item => !hasDateConflict(item.attributionStatus));

  return data.leads.map(lead => {
    const leadAppointments = appointments.filter(item => item.leadId === lead.id);
    const leadOffers = offers.filter(item => item.leadId === lead.id);
    const leadProjects = projects.filter(item => item.leadId === lead.id);
    const currentOffer = latestOffer(leadOffers);
    const verifiedProject = leadProjects.some(project => project.valueInclVat !== null || normalized(project.status).includes("won") || normalized(project.status).includes("project"));
    const signed = isSigned(lead);
    const notRelevant = isExplicitlyNotRelevant(lead);
    const rejected = leadOffers.some(offer => offer.isRejected) || lead.commercialStatus === "OFFER_LOST";
    const accepted = leadOffers.some(offer => offer.isAccepted);
    const visit = hasVisitEvidence(data, lead);

    let stage: JourneyStage = "new";
    if (notRelevant || rejected) stage = "lost";
    else if (verifiedProject) stage = "verified";
    else if (signed) stage = "signed";
    else if (accepted) stage = "accepted";
    else if (leadOffers.length > 0) stage = "offer";
    else if (visit) stage = "visit";
    else if (isQualified(lead)) stage = "qualified";

    return {
      lead,
      stage,
      appointments: leadAppointments,
      offers: leadOffers,
      latestOffer: currentOffer,
      projects: leadProjects,
      offerValue: leadOffers.reduce((sum, item) => sum + item.priceInclVat, 0),
      openOfferValue: leadOffers.filter(item => item.isOpen).reduce((sum, item) => sum + item.priceInclVat, 0),
      acceptedOfferValue: leadOffers.filter(item => item.isAccepted).reduce((sum, item) => sum + item.priceInclVat, 0),
      projectValue: leadProjects.reduce((sum, item) => sum + Number(item.valueInclVat ?? 0), 0),
      hasVisit: visit,
      isSigned: signed,
      isNotRelevant: notRelevant,
      lostReason: notRelevant ? lead.crmStatus : rejected ? (currentOffer?.status ?? lead.quoteStatus) : "",
    };
  });
}

export function buildFunnelSummary(data: CompanyDataset): FunnelSummary {
  const rows = buildJourneyRows(data);
  const offers = (data.commercialOffers ?? []).filter(item => !hasDateConflict(item.attributionStatus));
  const projects = (data.commercialProjects ?? []).filter(item => !hasDateConflict(item.attributionStatus));
  const leadIdsWithOffer = new Set(offers.map(item => item.leadId));
  const acceptedLeadIds = new Set(offers.filter(item => item.isAccepted).map(item => item.leadId));
  const openLeadIds = new Set(offers.filter(item => item.isOpen).map(item => item.leadId));
  const verifiedLeadIds = new Set(projects.filter(item => Number(item.valueInclVat ?? 0) > 0 || normalized(item.status).includes("won")).map(item => item.leadId));

  return {
    leads: data.leads.length,
    uniquePeople: uniquePersonCount(data.leads),
    qualified: rows.filter(row => !row.isNotRelevant && (row.stage !== "new" && row.stage !== "lost")).length,
    visits: rows.filter(row => row.hasVisit).length,
    offersSent: leadIdsWithOffer.size,
    quotedValue: offers.reduce((sum, item) => sum + item.priceInclVat, 0),
    openOffers: openLeadIds.size,
    openPipelineValue: offers.filter(item => item.isOpen).reduce((sum, item) => sum + item.priceInclVat, 0),
    acceptedOffers: acceptedLeadIds.size,
    acceptedOfferValue: offers.filter(item => item.isAccepted).reduce((sum, item) => sum + item.priceInclVat, 0),
    crmSigned: rows.filter(row => row.isSigned).length,
    verifiedProjects: verifiedLeadIds.size,
    verifiedRevenue: projects.reduce((sum, item) => sum + Number(item.valueInclVat ?? 0), 0),
  };
}

export function stageConversion(current: number, previous: number) {
  return previous > 0 ? current / previous * 100 : null;
}

export function sourcePipelineRows(data: CompanyDataset) {
  const rows = buildJourneyRows(data);
  const sources = [...new Set(rows.map(row => row.lead.source || "Unattributed"))];

  return sources.map(source => {
    const sourceRows = rows.filter(row => (row.lead.source || "Unattributed") === source);
    const costs = sourceRows.map(row => row.lead.acquisitionCost);
    const cost = costs.length > 0 && costs.every(value => value !== null)
      ? costs.reduce<number>((sum, value) => sum + Number(value), 0)
      : null;

    return {
      source,
      cost,
      leads: sourceRows.length,
      qualified: sourceRows.filter(row => row.stage !== "new" && row.stage !== "lost").length,
      visits: sourceRows.filter(row => row.hasVisit).length,
      offers: sourceRows.filter(row => row.offers.length > 0).length,
      quotedValue: sourceRows.reduce((sum, row) => sum + row.offerValue, 0),
      openPipeline: sourceRows.reduce((sum, row) => sum + row.openOfferValue, 0),
      signed: sourceRows.filter(row => row.isSigned).length,
      verified: sourceRows.filter(row => row.stage === "verified").length,
      revenue: sourceRows.reduce((sum, row) => sum + row.projectValue, 0),
      notRelevant: sourceRows.filter(row => row.isNotRelevant).length,
    };
  }).sort((a, b) => b.revenue - a.revenue || b.openPipeline - a.openPipeline || b.leads - a.leads);
}
