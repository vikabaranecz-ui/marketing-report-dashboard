"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Mail, MapPin, Phone, X } from "lucide-react";
import type { CommercialInvoice, CommercialOffer, CommercialProject, CompanyDataset, Lead } from "@/lib/data/types";
import { formatCurrency, formatNumber } from "@/lib/metrics/kpis";
import { buildSourcePerformance, normalizeAcquisitionSource } from "@/lib/metrics/business-overview";
import { EmptyState, StatusPill } from "./ui";
import { RecordDrilldownDrawer, type RecordDrilldown } from "./record-drilldown";

type OfferTab = "open" | "accepted" | "rejected" | "cancelled" | "all";
type SourceRow = { source: string; leads: number; crmLeads: number; deliveredLeads: number | null; matched: number; offers: number; openValue: number; rejectedValue: number; acceptedValue: number; clients: number; invoiced: number; paid: number; cost: number | null; cac: number | null; roas: number | null };
const verifiedMethods = new Set(["EMAIL+PHONE", "EMAIL", "PHONE", "NAME"]);
const emptyOffers: CommercialOffer[] = [];
const emptyProjects: CommercialProject[] = [];
const emptyInvoices: CommercialInvoice[] = [];

export function LeadsSalesPage({ data }: { data: CompanyDataset }) {
  const [source, setSource] = useState<string | null>(null);
  const [offerTab, setOfferTab] = useState<OfferTab>("open");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [records,setRecords]=useState<RecordDrilldown|null>(null);
  const offers = data.commercialOffers ?? emptyOffers;
  const projects = data.commercialProjects ?? emptyProjects;
  const invoices = data.commercialInvoices ?? emptyInvoices;
  const appointmentLeadIds = new Set(data.appointmentLeadIds ?? []);
  const robaws = data.integrations.find(item => item.provider === "robaws");
  const sourceRows = useMemo(() => buildSourceRows(data, offers, projects, invoices), [data, offers, projects, invoices]);
  const selectedSourceRow = source ? sourceRows.find(row => row.source === source) ?? null : null;
  const filteredLeads = source ? data.leads.filter(lead => normalizeAcquisitionSource(lead.source) === source) : data.leads;
  const filteredOffers = source ? offers.filter(offer => normalizeAcquisitionSource(offer.source) === source) : offers;
  const filteredProjects = source ? projects.filter(project => normalizeAcquisitionSource(project.source) === source) : projects;
  const filteredInvoices = source ? invoices.filter(invoice => normalizeAcquisitionSource(invoice.source) === source) : invoices;
  const attributedProjects = filteredProjects.filter(project => !hasDateConflict(project.attributionStatus));
  const attributedInvoices = filteredInvoices.filter(invoice => !hasDateConflict(invoice.attributionStatus));
  const verifiedClients = filteredLeads.filter(lead => verifiedMethods.has(lead.robawsMatchMethod) && lead.commercialStatus === "CLIENT_WON" && !hasDateConflict(lead.attributionLevel));
  const matchedLeads = filteredLeads.filter(lead => verifiedMethods.has(lead.robawsMatchMethod));
  const openOffers = filteredOffers.filter(offer => offer.isOpen).sort((a, b) => b.priceInclVat - a.priceInclVat);
  const acceptedOffers = filteredOffers.filter(offer => offer.isAccepted);
  const cancelledOffers = filteredOffers.filter(offer => offer.isCancelled);
  const invoiced = attributedInvoices.reduce((total, invoice) => total + Math.max(0, invoice.totalInclVat - invoice.creditedTotal), 0);
  const paid = sum(attributedInvoices, "paidTotal");
  const selectedOffers = selected ? offers.filter(offer => offer.leadId === selected.id) : [];
  const selectedProjects = selected ? projects.filter(project => project.leadId === selected.id) : [];
  const selectedInvoices = selected ? invoices.filter(invoice => invoice.leadId === selected.id) : [];
  const outcomeOffers = filteredOffers.filter(offer => offerTab === "all" || (offerTab === "open" && offer.isOpen) || (offerTab === "accepted" && offer.isAccepted) || (offerTab === "rejected" && offer.isRejected) || (offerTab === "cancelled" && offer.isCancelled));
  const highestOpenValue = openOffers[0]?.priceInclVat ?? 0;
  const dateConflictLeadIds = new Set([
    ...filteredLeads.filter(lead => hasDateConflict(lead.attributionLevel)).map(lead => lead.id),
    ...filteredOffers.filter(offer => hasDateConflict(offer.attributionStatus)).map(offer => offer.leadId),
    ...filteredProjects.filter(project => hasDateConflict(project.attributionStatus)).map(project => project.leadId),
    ...filteredInvoices.filter(invoice => invoice.leadId && hasDateConflict(invoice.attributionStatus)).map(invoice => invoice.leadId as string),
  ]);
  const dateConflicts = dateConflictLeadIds.size;
  const ambiguous = filteredLeads.filter(lead => lead.robawsMatchMethod === "AMBIGUOUS").length;

  const pipeline = [
    { label: "CRM tracked", count: filteredLeads.length, value: null },
    { label: "Site visit", count: filteredLeads.filter(lead => appointmentLeadIds.has(lead.id) || hasReachedVisit(lead)).length, value: null },
    { label: "Offer", count: new Set(filteredOffers.map(offer => offer.leadId)).size, value: sum(filteredOffers, "priceInclVat") },
    { label: "Waiting", count: new Set(openOffers.map(offer => offer.leadId)).size, value: sum(openOffers, "priceInclVat") },
    { label: "Accepted", count: new Set(acceptedOffers.map(offer => offer.leadId)).size, value: sum(acceptedOffers, "priceInclVat") },
    { label: "Project", count: new Set(attributedProjects.map(project => project.leadId)).size, value: sum(attributedProjects, "valueInclVat") },
    { label: "Invoiced", count: new Set(attributedInvoices.map(invoice => invoice.leadId).filter(Boolean)).size, value: invoiced },
    { label: "Paid", count: new Set(attributedInvoices.filter(invoice => invoice.paidTotal > 0).map(invoice => invoice.leadId).filter(Boolean)).size, value: paid },
  ];

  function focusOpenOffers(nextSource: string) {
    setSource(nextSource);
    setOfferTab("open");
    window.requestAnimationFrame(() => document.getElementById("open-opportunities")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return <div className="space-y-8">
    <div className="sales-command-bar"><div><p className="sales-kicker">Commercial evidence · ROBAWS + CRM</p><p className="mt-1 text-sm text-[var(--muted)]">Every count and euro amount below comes from a stored record. Date conflicts are excluded from attributed revenue.</p></div><div className="flex flex-wrap items-center gap-2">{source && <span className="source-filter-label">Source: {source}</span>}<button className={source ? "button-secondary" : "button-primary"} onClick={() => setSource(null)}>All sources</button></div></div>

    {robaws?.status !== "Connected" && <div className="sales-data-notice"><AlertTriangle size={17} /><div><strong>ROBAWS commercial data is not connected yet.</strong><p>Lead sources are live. Offers, project values, invoices and payments remain empty until ROBAWS is connected and synced.</p></div></div>}

    <section aria-labelledby="executive-snapshot"><SectionTitle id="executive-snapshot" eyebrow="01 · Executive snapshot" title="Money and movement" description={source ? `Filtered to ${source}` : "All real CRM leads and verified ROBAWS evidence"} /><div className="sales-kpi-grid">
      <Metric label={selectedSourceRow?.deliveredLeads!==null&&selectedSourceRow?.deliveredLeads!==undefined?"Delivered leads":"Leads"} value={formatNumber(selectedSourceRow?.deliveredLeads??filteredLeads.length)} note={selectedSourceRow?.deliveredLeads!==null&&selectedSourceRow?.deliveredLeads!==undefined?String(filteredLeads.length)+" CRM-attributed records":"CRM records"} onClick={()=>setRecords({title:"Leads",subtitle:data.periodLabel,leads:filteredLeads})}/><Metric label="ROBAWS matched" value={formatNumber(matchedLeads.length)} note="Email, phone or unique exact name" onClick={()=>setRecords({title:"ROBAWS-matched leads",subtitle:data.periodLabel,leads:matchedLeads})}/><Metric label="Offers sent" value={formatNumber(filteredOffers.length)} note="Individual offers" onClick={()=>setRecords({title:"ROBAWS offers",subtitle:data.periodLabel,offers:filteredOffers})}/><Metric label="Open offer value" value={formatCurrency(sum(openOffers, "priceInclVat"), true)} note={`${openOffers.length} waiting`} money onClick={()=>setRecords({title:"Open offers",subtitle:data.periodLabel,offers:openOffers})}/><Metric label="Accepted project value" value={formatCurrency(sum(attributedProjects, "valueInclVat"), true)} note="Date conflicts excluded" money onClick={()=>setRecords({title:"Attributed projects",subtitle:data.periodLabel,projects:attributedProjects})}/><Metric label="CRM-linked clients" value={formatNumber(verifiedClients.length)} note="Operational ROBAWS evidence" onClick={()=>setRecords({title:"Attributed clients",subtitle:data.periodLabel,leads:verifiedClients})}/><Metric label="Invoiced" value={formatCurrency(invoiced, true)} note="Net of credits · incl. VAT" money onClick={()=>setRecords({title:"Attributed invoices",subtitle:data.periodLabel,invoices:attributedInvoices})}/><Metric label="Paid" value={formatCurrency(paid, true)} note="Verified attribution" money accent onClick={()=>setRecords({title:"Invoices with paid cash",subtitle:data.periodLabel,invoices:attributedInvoices.filter(item=>item.paidTotal>0)})}/>
    </div></section>

    <section aria-labelledby="pipeline-value"><SectionTitle id="pipeline-value" eyebrow="02 · Sales pipeline value" title="From CRM-tracked lead to cash" description="This is the operational CRM pipeline. Supplier-only leads are counted in acquisition totals elsewhere but are not assigned sales stages without CRM evidence." /><div className="pipeline-flow">{pipeline.map((stage, index) => {const selection:RecordDrilldown=stage.label==="CRM tracked"?{title:"CRM-tracked leads",subtitle:data.periodLabel,leads:filteredLeads}:stage.label==="Site visit"?{title:"Visit-stage leads",subtitle:data.periodLabel,leads:filteredLeads.filter(lead=>appointmentLeadIds.has(lead.id)||hasReachedVisit(lead))}:stage.label==="Offer"?{title:"Offers",subtitle:data.periodLabel,offers:filteredOffers}:stage.label==="Waiting"?{title:"Open offers",subtitle:data.periodLabel,offers:openOffers}:stage.label==="Accepted"?{title:"Accepted offers",subtitle:data.periodLabel,offers:acceptedOffers}:stage.label==="Project"?{title:"Projects",subtitle:data.periodLabel,projects:attributedProjects}:stage.label==="Invoiced"?{title:"Invoices",subtitle:data.periodLabel,invoices:attributedInvoices}:{title:"Paid invoices",subtitle:data.periodLabel,invoices:attributedInvoices.filter(item=>item.paidTotal>0)};return <button type="button" onClick={()=>setRecords(selection)} className={`pipeline-node drillable text-left ${stage.label === "Paid" ? "pipeline-node-paid" : ""}`} key={stage.label}><div className="flex items-center justify-between gap-2"><span>{stage.label}</span>{index < pipeline.length - 1 && <ArrowRight size={14} className="pipeline-arrow" />}</div><strong className="drillable-value">{formatNumber(stage.count)}</strong><small>{rate(stage.count, filteredLeads.length)} of leads</small>{stage.value !== null && <em>{formatCurrency(stage.value, true)}</em>}</button>})}</div></section>

    <section aria-labelledby="source-performance"><SectionTitle id="source-performance" eyebrow="03 · Source performance" title="Which sources create money?" description="Source economics use the same verified acquisition logic as Overview. Supplier-delivered lead counts are used when a verified source file exists; CRM operational stages remain CRM-backed." /><div className="analytics-table-wrap"><table className="analytics-table source-performance-table"><thead><tr><th>Source</th><th>Leads</th><th>ROBAWS matched</th><th>Offers</th><th>Open offer €</th><th>Rejected offer €</th><th>Project value €</th><th>Clients</th><th>Lead → client</th><th>Invoiced €</th><th>Paid €</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>{sourceRows.map(row => <tr key={row.source} className={source === row.source ? "is-selected" : ""}><td><button className="source-link" onClick={() => setSource(current => current === row.source ? null : row.source)}>{row.source}<span>{source === row.source ? "Filtered" : "Filter"}</span></button></td><td>{row.deliveredLeads===null&&row.crmLeads===0&&row.clients>0?<StatusPill tone="warn">Lead count missing</StatusPill>:<>{formatNumber(row.leads)}{row.deliveredLeads!==null&&<small className="block text-[var(--muted)]">{formatNumber(row.crmLeads)} CRM-attributed</small>}</>}</td><td>{formatNumber(row.matched)}</td><td>{formatNumber(row.offers)}</td><td><button className="money-link" onClick={() => focusOpenOffers(row.source)}>{formatCurrency(row.openValue, true)}</button></td><td>{formatCurrency(row.rejectedValue, true)}</td><td className="font-semibold text-[var(--ink)]">{formatCurrency(row.acceptedValue, true)}</td><td>{formatNumber(row.clients)}</td><td>{rate(row.clients, row.leads)}</td><td>{formatCurrency(row.invoiced, true)}</td><td className="font-semibold text-[var(--ink)]">{formatCurrency(row.paid, true)}</td><td>{row.cac===null?"—":formatCurrency(row.cac,true)}</td><td>{row.roas===null?"—":`${row.roas.toFixed(2)}×`}</td></tr>)}</tbody></table></div></section>

    <section id="open-opportunities" aria-labelledby="open-opportunities-title" className="scroll-mt-6"><SectionTitle id="open-opportunities-title" eyebrow="04 · Open sales opportunities" title="Money waiting for a decision" description="Non-final ROBAWS offers, sorted by offer price including VAT." meta={`${openOffers.length} open · ${formatCurrency(sum(openOffers, "priceInclVat"), true)}`} />
      {openOffers.length ? <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Lead</th><th>Source</th><th>Service</th><th>Offer date</th><th>Days waiting</th><th>ROBAWS status</th><th>Offer price incl. VAT</th><th>Offer #</th><th>Project</th></tr></thead><tbody>{openOffers.map(offer => { const lead = data.leads.find(item => item.id === offer.leadId); return <tr key={offer.id} className={offer.daysWaiting !== null && offer.daysWaiting > 14 ? "opportunity-critical" : offer.daysWaiting !== null && offer.daysWaiting > 7 ? "opportunity-warning" : ""}><td><button className="lead-link" onClick={() => lead && setSelected(lead)}>{offer.leadName}</button></td><td>{offer.source}</td><td>{lead?.service ?? "—"}</td><td>{formatDate(offer.date)}</td><td><WaitingBadge days={offer.daysWaiting} /></td><td><StatusPill tone="warn">{offer.status}</StatusPill></td><td className="font-semibold text-[var(--ink)]">{formatCurrency(offer.priceInclVat)} {highestOpenValue > 0 && offer.priceInclVat === highestOpenValue && <span className="highest-value">Highest value</span>}</td><td>{offer.number}</td><td>{offer.projectExternalId ?? "—"}</td></tr>; })}</tbody></table></div> : <EmptyState title="No open ROBAWS offers" body={robaws?.status === "Connected" ? "No non-final offers match this source selection." : "Connect and sync ROBAWS to load offers that are waiting for a client decision."} />}
    </section>

    <section aria-labelledby="offer-outcomes"><SectionTitle id="offer-outcomes" eyebrow="05 · Offer outcomes" title="Every offer, separately" description="Multiple offers for the same client remain separate commercial records." /><div className="segmented-control" role="tablist" aria-label="Offer outcome">{(["open", "accepted", "rejected", "cancelled", "all"] as OfferTab[]).map(tab => <button key={tab} role="tab" aria-selected={offerTab === tab} onClick={() => setOfferTab(tab)}>{tab==="rejected"?"Afgekeurd":capitalize(tab)} <span>{tab === "all" ? filteredOffers.length : tab==="open"?filteredOffers.filter(offer=>offer.isOpen).length:tab==="accepted"?acceptedOffers.length:tab==="cancelled"?cancelledOffers.length:filteredOffers.filter(offer=>offer.isRejected).length}</span></button>)}</div>
      {outcomeOffers.length ? <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Lead</th><th>Source</th><th>Offer #</th><th>Date</th><th>Status</th><th>Price excl. VAT</th><th>Price incl. VAT</th><th>Project</th><th>Attribution confidence</th></tr></thead><tbody>{outcomeOffers.map(offer => { const lead = data.leads.find(item => item.id === offer.leadId); return <tr key={offer.id}><td><button className="lead-link" onClick={() => lead && setSelected(lead)}>{offer.leadName}</button></td><td>{offer.source}</td><td>{offer.number}</td><td>{formatDate(offer.date)}</td><td><OutcomePill offer={offer} /></td><td>{formatCurrency(offer.priceExclVat)}</td><td className="font-semibold text-[var(--ink)]">{formatCurrency(offer.priceInclVat)}</td><td>{offer.projectExternalId ?? "—"}</td><td><Attribution value={offer.attributionStatus} /></td></tr>; })}</tbody></table></div> : <EmptyState title={`No ${offerTab} offers`} body="No ROBAWS offer records match this view." />}
    </section>

    <section aria-labelledby="verified-clients"><SectionTitle id="verified-clients" eyebrow="06 · CRM-linked clients" title="CRM-linked commercial customers" description="Operational view of ROBAWS-confirmed clients linked to CRM people. Cohort CAC/ROAS elsewhere additionally requires a trustworthy acquisition date." />
      {verifiedClients.length ? <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Lead</th><th>Original source</th><th>Match method</th><th>Accepted project value</th><th>Project status</th><th>Invoiced</th><th>Paid</th><th>Attribution status</th></tr></thead><tbody>{verifiedClients.map(lead => { const leadProjects = projects.filter(project => project.leadId === lead.id && !hasDateConflict(project.attributionStatus)); const leadInvoices = invoices.filter(invoice => invoice.leadId === lead.id && !hasDateConflict(invoice.attributionStatus)); return <tr key={lead.id}><td><button className="lead-link" onClick={() => setSelected(lead)}>{lead.name}</button></td><td>{lead.source}</td><td><StatusPill tone="good">{lead.robawsMatchMethod}</StatusPill></td><td>{formatCurrency(sum(leadProjects, "valueInclVat"))}</td><td>{leadProjects.map(project => project.status).filter(Boolean).join(", ") || "—"}</td><td>{formatCurrency(leadInvoices.reduce((total, invoice) => total + Math.max(0, invoice.totalInclVat - invoice.creditedTotal), 0))}</td><td>{formatCurrency(sum(leadInvoices, "paidTotal"))}</td><td><Attribution value={lead.attributionLevel} /></td></tr>; })}</tbody></table></div> : <EmptyState title="No attributed clients yet" body="A lead appears here after an EMAIL+PHONE, EMAIL, PHONE or unique exact NAME match plus commercial evidence in ROBAWS. Date-conflict clients stay outside marketing attribution." />}
    </section>

    <section className="attribution-strip" aria-labelledby="attribution-quality"><div><p className="sales-kicker">07 · Attribution quality</p><h2 id="attribution-quality">Can this revenue be trusted?</h2></div><Diagnostic label="Total CRM leads" value={filteredLeads.length} /><Diagnostic label="Matched to ROBAWS" value={matchedLeads.length} /><Diagnostic label="Unmatched" value={filteredLeads.filter(lead => !verifiedMethods.has(lead.robawsMatchMethod) && lead.robawsMatchMethod !== "AMBIGUOUS").length} /><Diagnostic label="Ambiguous" value={ambiguous} /><Diagnostic label="CRM-linked clients" value={verifiedClients.length} /><Diagnostic label="Date conflicts" value={dateConflicts} warn={dateConflicts > 0} /></section>

    {selected && <LeadDrawer lead={selected} offers={selectedOffers} projects={selectedProjects} invoices={selectedInvoices} onClose={() => setSelected(null)} />}
    {records&&<RecordDrilldownDrawer data={data} selection={records} onClose={()=>setRecords(null)}/>}
  </div>;
}

function buildSourceRows(data: CompanyDataset, offers: CommercialOffer[], projects: CommercialProject[], invoices: CommercialInvoice[]) {
  const performance = buildSourcePerformance(data);
  const performanceBySource = new Map(performance.map(row => [row.source, row]));
  const sources = [...new Set([
    ...performance.map(row => row.source),
    ...data.leads.map(lead => normalizeAcquisitionSource(lead.source)),
  ])];
  return sources.map((source): SourceRow => {
    const sourceLeads = data.leads.filter(lead => normalizeAcquisitionSource(lead.source) === source);
    const sourceOffers = offers.filter(offer => normalizeAcquisitionSource(offer.source) === source && !hasDateConflict(offer.attributionStatus));
    const sourceProjects = projects.filter(project => normalizeAcquisitionSource(project.source) === source && !hasDateConflict(project.attributionStatus));
    const sourceInvoices = invoices.filter(invoice => normalizeAcquisitionSource(invoice.source) === source && !hasDateConflict(invoice.attributionStatus));
    const row = performanceBySource.get(source);
    const crmLeads = row?.leads ?? sourceLeads.length;
    const deliveredLeads = row?.deliveredLeads ?? null;
    const effectiveLeads = deliveredLeads ?? crmLeads;
    const clients = row?.attributableClients ?? sourceLeads.filter(lead => verifiedMethods.has(lead.robawsMatchMethod) && lead.commercialStatus === "CLIENT_WON" && !hasDateConflict(lead.attributionLevel)).length;
    return {
      source,
      leads: effectiveLeads,
      crmLeads,
      deliveredLeads,
      matched: sourceLeads.filter(lead => verifiedMethods.has(lead.robawsMatchMethod)).length,
      offers: sourceOffers.length,
      openValue: sum(sourceOffers.filter(offer => offer.isOpen), "priceInclVat"),
      rejectedValue: sum(sourceOffers.filter(offer => offer.isRejected), "priceInclVat"),
      acceptedValue: row?.projectValueInclVat ?? sum(sourceProjects, "valueInclVat"),
      clients,
      invoiced: row?.invoicedValue ?? sourceInvoices.reduce((total, invoice) => total + Math.max(0, invoice.totalInclVat - invoice.creditedTotal), 0),
      paid: row?.paidValue ?? sum(sourceInvoices, "paidTotal"),
      cost: row?.spend ?? null,
      cac: row?.cac ?? null,
      roas: row?.cohortCashRoas ?? null,
    };
  }).sort((a, b) => b.paid - a.paid || b.acceptedValue - a.acceptedValue || b.leads - a.leads);
}

function SectionTitle({ id, eyebrow, title, description, meta }: { id: string; eyebrow: string; title: string; description: string; meta?: string }) { return <div className="sales-section-heading"><div><p className="sales-kicker">{eyebrow}</p><h2 id={id}>{title}</h2><p>{description}</p></div>{meta && <strong>{meta}</strong>}</div>; }
function Metric({ label, value, note, money = false, accent = false, onClick }: { label: string; value: string; note: string; money?: boolean; accent?: boolean; onClick?:()=>void }) { const cls=`sales-metric ${money ? "sales-metric-money" : ""} ${accent ? "sales-metric-accent" : ""} ${onClick?"drillable":""}`;const content=<><span>{label}</span><strong className={onClick?"drillable-value":""}>{value}</strong><small>{note}</small></>;return onClick?<button type="button" className={cls+" text-left"} onClick={onClick}>{content}</button>:<div className={cls}>{content}</div>; }
function Diagnostic({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) { return <div className={warn ? "diagnostic-warn" : ""}><span>{label}</span><strong>{formatNumber(value)}</strong></div>; }
function WaitingBadge({ days }: { days: number | null }) { if (days === null) return <>—</>; const tone = days > 14 ? "bad" : days > 7 ? "warn" : "neutral"; return <StatusPill tone={tone}>{days} days</StatusPill>; }
function OutcomePill({ offer }: { offer: CommercialOffer }) { return <StatusPill tone={offer.isAccepted ? "good" : offer.isRejected || offer.isCancelled ? "bad" : "warn"}>{offer.status}</StatusPill>; }
function Attribution({ value }: { value: string }) { const conflict = hasDateConflict(value); return <StatusPill tone={conflict ? "bad" : value.includes("EXACT") || value === "VERIFIED" ? "good" : "neutral"}>{conflict ? "REVIEW_DATE_CONFLICT" : value}</StatusPill>; }

function LeadDrawer({ lead, offers, projects, invoices, onClose }: { lead: Lead; offers: CommercialOffer[]; projects: CommercialProject[]; invoices: CommercialInvoice[]; onClose: () => void }) {
  const attributedInvoices = invoices.filter(item => !hasDateConflict(item.attributionStatus));
  const invoiced = attributedInvoices.reduce((total, item) => total + Math.max(0, item.totalInclVat - item.creditedTotal), 0);
  const paid = sum(attributedInvoices, "paidTotal");
  return <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}><aside className="drawer sales-drawer" role="dialog" aria-modal="true" aria-label={`${lead.name} commercial details`} onMouseDown={event => event.stopPropagation()}><header><div><p className="sales-kicker">Lead evidence</p><h2>{lead.name}</h2><p>{lead.source} · received {formatDate(lead.date)}</p></div><button className="icon-button" onClick={onClose} aria-label="Close lead details"><X size={18} /></button></header><div className="sales-drawer-body">
    <div className="contact-stack"><span><Mail size={15} />{lead.email || "No email"}</span><span><Phone size={15} />{lead.phone || "No phone"}</span><span><MapPin size={15} />{lead.municipality}</span></div>
    <DrawerSection title="CRM source"><DrawerRow label="Original source" value={lead.source} /><DrawerRow label="Exact Monday status" value={lead.crmStatus} /><DrawerRow label="Service" value={lead.service} /><DrawerRow label="Campaign" value={lead.campaign} /></DrawerSection>
    <DrawerSection title={`ROBAWS offers · ${offers.length}`}>{offers.length ? offers.map(offer => <div className="evidence-record" key={offer.id}><div><strong>{offer.number}</strong><StatusPill tone={offer.isAccepted ? "good" : offer.isRejected ? "bad" : "warn"}>{offer.status}</StatusPill></div><p>{formatDate(offer.date)} · excl. VAT {formatCurrency(offer.priceExclVat)} · incl. VAT <b>{formatCurrency(offer.priceInclVat)}</b></p><Attribution value={offer.attributionStatus} /></div>) : <p className="drawer-empty">No ROBAWS offers linked.</p>}</DrawerSection>
    <DrawerSection title={`Projects · ${projects.length}`}>{projects.length ? projects.map(project => <div className="evidence-record" key={project.id}><div><strong>{project.externalId}</strong><StatusPill tone="neutral">{project.status}</StatusPill></div><p>Project value {formatCurrency(project.valueInclVat)}</p><Attribution value={project.attributionStatus} /></div>) : <p className="drawer-empty">No projects linked.</p>}</DrawerSection>
    <DrawerSection title={`Invoices · ${invoices.length}`}>{invoices.length ? invoices.map(invoice => <div className="evidence-record" key={invoice.id}><div><strong>{invoice.number}</strong><StatusPill tone="neutral">{invoice.status}</StatusPill></div><p>{formatDate(invoice.date)} · invoiced {formatCurrency(invoice.totalInclVat)} · paid <b>{formatCurrency(invoice.paidTotal)}</b></p><Attribution value={invoice.attributionStatus} /></div>) : <p className="drawer-empty">No invoices linked.</p>}</DrawerSection>
    <DrawerSection title="Attributed totals"><DrawerRow label="Invoiced" value={formatCurrency(invoiced)} /><DrawerRow label="Paid" value={formatCurrency(paid)} /><DrawerRow label="Attribution" value={hasDateConflict(lead.attributionLevel) ? "REVIEW_DATE_CONFLICT — excluded from source revenue" : lead.attributionLevel} /></DrawerSection>
  </div></aside></div>;
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="drawer-section"><h3>{title}</h3><div>{children}</div></section>; }
function DrawerRow({ label, value }: { label: string; value: string }) { return <div className="drawer-row"><span>{label}</span><strong>{value || "—"}</strong></div>; }
function hasReachedVisit(lead: Lead) {
  const status = lead.crmStatus.trim().toLowerCase().replace(/\s+/g, " ");
  const stage = lead.stage.trim().toLowerCase();
  return ["visit completed", "quote sent", "won"].includes(stage) ||
    ["visited offerte to be done", "offer sent", "email offerte", "signed", "offerte afgekeurd"].includes(status);
}
function hasDateConflict(value: string) { return value.includes("DATE_CONFLICT"); }
function sum<T>(rows: T[], key: keyof T) { return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0); }
function rate(part: number, total: number) { return total ? `${new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 }).format((part / total) * 100)}%` : "—"; }
function formatDate(value: string) { if (!value) return "—"; const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value); return new Intl.DateTimeFormat("nl-BE", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Brussels" }).format(date); }
function capitalize(value: string) { return value[0].toUpperCase() + value.slice(1); }
