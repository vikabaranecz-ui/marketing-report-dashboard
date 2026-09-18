import type { CommercialAppointment, CommercialOffer, CommercialProject, CompanyDataset, Lead } from "@/lib/data/types";

export type JourneyStage = "new" | "qualified" | "visit" | "offer" | "accepted" | "signed" | "verified" | "lost";

export const journeyStageMeta: Array<{ key: JourneyStage; label: string; description: string }> = [
  { key: "new", label: "New lead", description: "Received, not yet qualified" },
  { key: "qualified", label: "Qualified", description: "Relevant lead ready for sales" },
  { key: "visit", label: "Visit", description: "Visit booked or completed" },
  { key: "offer", label: "Offer", description: "Open ROBAWS offer; sent status is shown separately" },
  { key: "accepted", label: "Offer accepted", description: "Offer accepted, not yet commercially verified" },
  { key: "signed", label: "CRM signed", description: "CRM says signed, project not yet commercially verified" },
  { key: "verified", label: "Verified project", description: "Commercial project verified" },
  { key: "lost", label: "Lost / not relevant", description: "Rejected, lost or explicitly not relevant" },
];

export type JourneyRow = {
  lead: Lead;
  crmRecordCount: number;
  sourcesSeen: string[];
  stage: JourneyStage;
  appointments: CommercialAppointment[];
  offers: CommercialOffer[];
  latestOffer: CommercialOffer | null;
  projects: CommercialProject[];
  offerValue: number;
  sentOfferValue: number;
  openOfferValue: number;
  acceptedOfferValue: number;
  projectValue: number;
  hasVisit: boolean;
  isQualified: boolean;
  isSigned: boolean;
  isNotRelevant: boolean;
  lostReason: string;
};

export type FunnelSummary = {
  leads: number;
  uniquePeople: number;
  notRelevantPeople: number;
  qualified: number;
  visits: number;
  offersCreated: number;
  offersSent: number;
  quotedValue: number;
  sentQuotedValue: number;
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

function identityParts(lead: Lead) {
  const email = lead.email.trim().toLowerCase();
  const phoneDigits = lead.phone.replace(/\D/g, "");
  const phone = phoneDigits.length >= 8 ? phoneDigits : "";
  const normalizedName = lead.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const name = normalizedName.split(" ").filter(Boolean).length >= 2 && normalizedName.length >= 6
    ? normalizedName
    : "";
  return { email, phone, name };
}

function groupLeadsByIdentity(leads: Lead[]) {
  type Group = { leads: Lead[]; emails: Set<string>; phones: Set<string>; names: Set<string> };
  const groups: Group[] = [];

  for (const lead of [...leads].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const keys = identityParts(lead);
    const matches = groups.filter(group =>
      Boolean(
        (keys.email && group.emails.has(keys.email))
        || (keys.phone && group.phones.has(keys.phone))
        || (keys.name && group.names.has(keys.name))
      ),
    );

    const target = matches[0] ?? { leads: [], emails: new Set<string>(), phones: new Set<string>(), names: new Set<string>() };
    if (matches.length === 0) groups.push(target);

    if (matches.length > 1) {
      for (const duplicateGroup of matches.slice(1)) {
        target.leads.push(...duplicateGroup.leads);
        duplicateGroup.emails.forEach(value => target.emails.add(value));
        duplicateGroup.phones.forEach(value => target.phones.add(value));
        duplicateGroup.names.forEach(value => target.names.add(value));
        groups.splice(groups.indexOf(duplicateGroup), 1);
      }
    }

    target.leads.push(lead);
    if (keys.email) target.emails.add(keys.email);
    if (keys.phone) target.phones.add(keys.phone);
    if (keys.name) target.names.add(keys.name);
  }

  return groups.map(group => group.leads.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)));
}

function masterLead(leads: Lead[]) {
  const earliest = leads[0];
  const latest = leads[leads.length - 1];
  return {
    ...latest,
    id: earliest.id,
    date: earliest.date,
    source: earliest.source,
    campaign: earliest.campaign,
    ad: earliest.ad,
    acquisitionCost: earliest.acquisitionCost,
    attributionLevel: earliest.attributionLevel,
    utm: earliest.utm,
    name: earliest.name || latest.name,
    email: earliest.email || latest.email,
    phone: earliest.phone || latest.phone,
  };
}

export function buildJourneyRows(data: CompanyDataset): JourneyRow[] {
  const appointments = data.commercialAppointments ?? [];
  const offers = (data.commercialOffers ?? []).filter(item => !hasDateConflict(item.attributionStatus));
  const projects = (data.commercialProjects ?? []).filter(item => !hasDateConflict(item.attributionStatus));

  return groupLeadsByIdentity(data.leads).map(group => {
    const lead = masterLead(group);
    const leadIds = new Set(group.map(item => item.id));
    const leadAppointments = appointments.filter(item => leadIds.has(item.leadId));
    const leadOffers = offers.filter(item => leadIds.has(item.leadId));
    const leadProjects = projects.filter(item => leadIds.has(item.leadId));
    const currentOffer = latestOffer(leadOffers);
    const verifiedProject = leadProjects.some(project =>
      Number(project.valueInclVat ?? 0) > 0
      || normalized(project.status).includes("won")
      || normalized(project.status).includes("project"),
    );
    const signed = group.some(isSigned);
    const visit = leadAppointments.length > 0 || group.some(item => hasVisitEvidence(data, item));
    const accepted = leadOffers.some(offer => offer.isAccepted);
    const hasOffer = leadOffers.length > 0;
    const qualified = group.some(isQualified) || visit || hasOffer || accepted || signed || verifiedProject;
    const explicitNotRelevant = group.some(isExplicitlyNotRelevant);
    const currentRejected = Boolean(currentOffer?.isRejected) || lead.commercialStatus === "OFFER_LOST";
    const lost = !verifiedProject && !signed && !accepted && !currentOffer?.isOpen
      && (currentRejected || (!visit && !hasOffer && explicitNotRelevant));

    let stage: JourneyStage = "new";
    if (verifiedProject) stage = "verified";
    else if (signed) stage = "signed";
    else if (accepted) stage = "accepted";
    else if (currentOffer?.isOpen) stage = "offer";
    else if (lost) stage = "lost";
    else if (visit) stage = "visit";
    else if (qualified) stage = "qualified";

    return {
      lead,
      crmRecordCount: group.length,
      sourcesSeen: [...new Set(group.map(item => item.source || "Unattributed"))],
      stage,
      appointments: leadAppointments,
      offers: leadOffers,
      latestOffer: currentOffer,
      projects: leadProjects,
      offerValue: leadOffers.reduce((sum, item) => sum + item.priceInclVat, 0),
      sentOfferValue: leadOffers.filter(item => Boolean(item.sentAt)).reduce((sum, item) => sum + item.priceInclVat, 0),
      openOfferValue: leadOffers.filter(item => item.isOpen && Boolean(item.sentAt)).reduce((sum, item) => sum + item.priceInclVat, 0),
      acceptedOfferValue: leadOffers.filter(item => item.isAccepted).reduce((sum, item) => sum + item.priceInclVat, 0),
      projectValue: leadProjects.reduce((sum, item) => sum + Number(item.valueInclVat ?? 0), 0),
      hasVisit: visit,
      isQualified: qualified,
      isSigned: signed,
      isNotRelevant: lost && explicitNotRelevant,
      lostReason: lost
        ? (currentRejected ? (currentOffer?.status ?? lead.quoteStatus) : group.find(isExplicitlyNotRelevant)?.crmStatus ?? "Lost")
        : "",
    };
  });
}

export function buildFunnelSummary(data: CompanyDataset): FunnelSummary {
  const rows = buildJourneyRows(data);
  return {
    leads: data.leads.length,
    uniquePeople: rows.length,
    notRelevantPeople: rows.filter(row => row.isNotRelevant).length,
    qualified: rows.filter(row => row.isQualified).length,
    visits: rows.filter(row => row.hasVisit).length,
    offersCreated: rows.filter(row => row.offers.length > 0).length,
    offersSent: rows.filter(row => row.offers.some(item => Boolean(item.sentAt))).length,
    quotedValue: rows.reduce((sum, row) => sum + row.offerValue, 0),
    sentQuotedValue: rows.reduce((sum, row) => sum + row.sentOfferValue, 0),
    openOffers: rows.filter(row => row.openOfferValue > 0).length,
    openPipelineValue: rows.reduce((sum, row) => sum + row.openOfferValue, 0),
    acceptedOffers: rows.filter(row => row.acceptedOfferValue > 0).length,
    acceptedOfferValue: rows.reduce((sum, row) => sum + row.acceptedOfferValue, 0),
    crmSigned: rows.filter(row => row.isSigned).length,
    verifiedProjects: rows.filter(row => row.stage === "verified").length,
    verifiedRevenue: rows.reduce((sum, row) => sum + row.projectValue, 0),
  };
}

export function stageConversion(current: number, previous: number) {
  return previous > 0 ? current / previous * 100 : null;
}

export type PipelineDimensionRow = {
  key: string;
  leads: number;
  notRelevant: number;
  qualified: number;
  visits: number;
  offersCreated: number;
  offersSent: number;
  sentQuotedValue: number;
  openPipeline: number;
  signed: number;
  verified: number;
  revenue: number;
};

function pipelineRowsBy(data: CompanyDataset, selector: (row: JourneyRow) => string): PipelineDimensionRow[] {
  const rows = buildJourneyRows(data);
  const keys = [...new Set(rows.map(row => selector(row) || "Unassigned"))];
  return keys.map(key => {
    const group = rows.filter(row => (selector(row) || "Unassigned") === key);
    return {
      key,
      leads: group.length,
      notRelevant: group.filter(row => row.isNotRelevant).length,
      qualified: group.filter(row => row.isQualified).length,
      visits: group.filter(row => row.hasVisit).length,
      offersCreated: group.filter(row => row.offers.length > 0).length,
      offersSent: group.filter(row => row.offers.some(item => Boolean(item.sentAt))).length,
      sentQuotedValue: group.reduce((sum, row) => sum + row.sentOfferValue, 0),
      openPipeline: group.reduce((sum, row) => sum + row.openOfferValue, 0),
      signed: group.filter(row => row.isSigned).length,
      verified: group.filter(row => row.stage === "verified").length,
      revenue: group.reduce((sum, row) => sum + row.projectValue, 0),
    };
  }).sort((a,b) => b.revenue - a.revenue || b.openPipeline - a.openPipeline || b.leads - a.leads);
}

export function servicePipelineRows(data: CompanyDataset) {
  return pipelineRowsBy(data, row => row.lead.service || "Unassigned");
}

export function locationPipelineRows(data: CompanyDataset) {
  return pipelineRowsBy(data, row => row.lead.municipality || "Unknown");
}

export function campaignPipelineRows(data: CompanyDataset) {
  return pipelineRowsBy(data, row => row.lead.campaign || "Unattributed");
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
      qualified: sourceRows.filter(row => row.isQualified).length,
      visits: sourceRows.filter(row => row.hasVisit).length,
      offersCreated: sourceRows.filter(row => row.offers.length > 0).length,
      offers: sourceRows.filter(row => row.offers.some(item => Boolean(item.sentAt))).length,
      quotedValue: sourceRows.reduce((sum, row) => sum + row.offerValue, 0),
      sentQuotedValue: sourceRows.reduce((sum, row) => sum + row.sentOfferValue, 0),
      openPipeline: sourceRows.reduce((sum, row) => sum + row.openOfferValue, 0),
      signed: sourceRows.filter(row => row.isSigned).length,
      verified: sourceRows.filter(row => row.stage === "verified").length,
      revenue: sourceRows.reduce((sum, row) => sum + row.projectValue, 0),
      notRelevant: sourceRows.filter(row => row.isNotRelevant).length,
    };
  }).sort((a, b) => b.revenue - a.revenue || b.openPipeline - a.openPipeline || b.leads - a.leads);
}
