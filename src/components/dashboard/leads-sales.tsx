"use client";

import { useMemo, useState } from "react";
import { Clock3, Mail, MapPin, Phone, X } from "lucide-react";
import type { CompanyDataset, Lead } from "@/lib/data/types";
import { formatCurrency, formatNumber, formatPercent, percentage } from "@/lib/metrics/kpis";
import { Card, KpiCard, SectionHeader, StatusPill } from "./ui";

const stageOrder = ["New lead", "Contacted", "Qualified", "Visit booked", "Visit completed", "Quote sent", "Won"];

function leadState(lead: Lead) {
  return `${lead.crmStatus} ${lead.stage}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isWonLead(lead: Lead) {
  const value = leadState(lead);

  return (
    lead.stage === "Won" ||
    value.includes("signed") ||
    value.includes("closed won") ||
    value.includes("contract signed")
  );
}

function isRejectedOffer(lead: Lead) {
  const value = leadState(lead);

  return (
    value.includes("offerte afgekeurd") ||
    value.includes("proposal rejected") ||
    value.includes("offer rejected")
  );
}

function isOfferReached(lead: Lead) {
  const value = leadState(lead);

  return (
    isWonLead(lead) ||
    isRejectedOffer(lead) ||
    value.includes("offer sent") ||
    value.includes("email offerte") ||
    value.includes("proposal sent") ||
    value.includes("negotiation")
  );
}

function isAppointmentReached(lead: Lead) {
  const value = leadState(lead);

  return (
    isOfferReached(lead) ||
    value.includes("afspraak ingeboekt") ||
    value.includes("visited offerte") ||
    value.includes("visit booked") ||
    value.includes("visit completed") ||
    value.includes("initial consultation")
  );
}

export function LeadsSalesPage({ data }: { data: CompanyDataset }) {
  const [selected, setSelected] = useState<Lead | null>(null);
  const commercialDeals =
    data.commercialDeals ?? [];

  const offerLeads = data.leads.filter(
    isOfferReached,
  );

  const signedClients = data.leads.filter(
    isWonLead,
  );

  const rejectedOffers = data.leads.filter(
    isRejectedOffer,
  );

  const appointmentLeads = data.leads.filter(
    isAppointmentReached,
  );

  const wonDeals = commercialDeals.filter(
    deal => deal.stage === "won",
  );

  const lostDeals = commercialDeals.filter(
    deal => deal.stage === "lost",
  );

  const openDeals = commercialDeals.filter(
    deal =>
      deal.stage !== "won" &&
      deal.stage !== "lost",
  );

  const sumDeals = (
    rows: typeof commercialDeals,
  ) =>
    rows.reduce(
      (sum, deal) =>
        sum + (deal.value ?? 0),
      0,
    );

  const totalPipelineValue =
    sumDeals(commercialDeals);

  const wonDealValue =
    sumDeals(wonDeals);

  const lostDealValue =
    sumDeals(lostDeals);

  const openDealValue =
    sumDeals(openDeals);

  const sourceRows = useMemo(() => {
    const rows = new Map<string, {
      source: string;
      leads: number;
      appointments: number;
      offers: number;
      rejected: number;
      clients: number;
    }>();

    for (const lead of data.leads) {
      const source =
        lead.source || "Unattributed";

      const row =
        rows.get(source) ?? {
          source,
          leads: 0,
          appointments: 0,
          offers: 0,
          rejected: 0,
          clients: 0,
        };

      row.leads += 1;

      if (isAppointmentReached(lead)) {
        row.appointments += 1;
      }

      if (isOfferReached(lead)) {
        row.offers += 1;
      }

      if (isRejectedOffer(lead)) {
        row.rejected += 1;
      }

      if (isWonLead(lead)) {
        row.clients += 1;
      }

      rows.set(source, row);
    }

    return [...rows.values()]
      .sort((a,b) => b.leads - a.leads);
  }, [data.leads]);

  const crmStatuses = useMemo(() => {
    const rows = new Map<string, number>();

    for (const lead of data.leads) {
      const status =
        lead.crmStatus && lead.crmStatus !== "—"
          ? lead.crmStatus
          : "No CRM status";

      rows.set(status, (rows.get(status) ?? 0) + 1);
    }

    return [...rows.entries()]
      .map(([status, leads]) => ({ status, leads }))
      .sort((a,b) => b.leads - a.leads);
  }, [data.leads]);

  return <div className="space-y-6">
    <div className="kpi-grid kpi-grid-six border-l border-t border-[var(--line)]">
      <KpiCard
        label="CRM leads"
        value={formatNumber(data.leads.length)}
        meta="Actual CRM records"
      />

      <KpiCard
        label="Reached offer"
        value={formatNumber(offerLeads.length)}
        meta={`${formatPercent(percentage(offerLeads.length,data.leads.length))} of leads`}
      />

      <KpiCard
        label="Signed clients"
        value={formatNumber(signedClients.length)}
        meta="CRM signed / won"
      />

      <KpiCard
        label="Lead → client"
        value={formatPercent(percentage(signedClients.length,data.leads.length))}
        meta="Actual current outcome"
      />

      <KpiCard
        label="Won deal value"
        value={formatCurrency(wonDealValue,true)}
        meta={`${wonDeals.length} closed-won deals`}
      />

      <KpiCard
        label="Open pipeline"
        value={formatCurrency(openDealValue,true)}
        meta={`${openDeals.length} open / on-hold deals`}
      />
    </div>

    <Card className="p-5">
      <SectionHeader
        title="Commercial conversion"
        description="Real CRM outcomes — no synthetic qualification scores"
      />

      <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-5">
        <Mini
          label="All leads"
          value={String(data.leads.length)}
        />

        <Mini
          label="Appointment / later"
          value={String(appointmentLeads.length)}
        />

        <Mini
          label="Reached offer"
          value={String(offerLeads.length)}
        />

        <Mini
          label="Offer rejected"
          value={String(rejectedOffers.length)}
        />

        <Mini
          label="Signed / won"
          value={String(signedClients.length)}
        />
      </div>

      <div className="mt-5 grid gap-px bg-[var(--line)] sm:grid-cols-3">
        <Mini
          label="Lead → offer"
          value={formatPercent(percentage(offerLeads.length,data.leads.length))}
        />

        <Mini
          label="Offer → client"
          value={formatPercent(percentage(signedClients.length,offerLeads.length))}
        />

        <Mini
          label="Lead → client"
          value={formatPercent(percentage(signedClients.length,data.leads.length))}
        />
      </div>
    </Card>

    <Card className="p-5">
      <SectionHeader
        title="Commercial pipeline value"
        description="Imported from Monday Deals — values are not attributed to a specific lead until email/phone matching is verified"
      />

      <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4">
        <Mini
          label="Total deal value"
          value={formatCurrency(totalPipelineValue,true)}
        />

        <Mini
          label="Closed won"
          value={formatCurrency(wonDealValue,true)}
        />

        <Mini
          label="Closed lost"
          value={formatCurrency(lostDealValue,true)}
        />

        <Mini
          label="Open / on hold"
          value={formatCurrency(openDealValue,true)}
        />
      </div>
    </Card>

    <Card className="p-5">
      <SectionHeader
        title="Lead source → commercial outcome"
        description="Exact CRM source connected to offers, clients and won revenue"
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>CRM source</th>
              <th>Leads</th>
              <th>Appointments+</th>
              <th>Reached offer</th>
              <th>Rejected offer</th>
              <th>Clients</th>
              <th>Lead → client</th>
              <th>Offer → client</th>
            </tr>
          </thead>
          <tbody>
            {sourceRows.map(row => (
              <tr key={row.source}>
                <td className="font-semibold">{row.source}</td>
                <td>{row.leads}</td>
                <td>{row.appointments}</td>
                <td>{row.offers}</td>
                <td>{row.rejected}</td>
                <td>{row.clients}</td>
                <td>{formatPercent(percentage(row.clients,row.leads))}</td>
                <td>{formatPercent(percentage(row.clients,row.offers))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>

    <Card className="p-5">
      <SectionHeader
        title="Deal / project values"
        description="Commercial pipeline imported from Monday Deals"
      />

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Deal</th>
              <th>Pipeline</th>
              <th>Value</th>
              <th>Offer status</th>
              <th>Offer number</th>
              <th>Lost reason</th>
              <th>Lead linked</th>
            </tr>
          </thead>

          <tbody>
            {commercialDeals
              .sort((a,b) => (b.value ?? 0) - (a.value ?? 0))
              .map(deal => (
                <tr key={deal.id}>
                  <td className="font-semibold">{deal.name}</td>
                  <td>{deal.pipelineGroup}</td>
                  <td>{formatCurrency(deal.value)}</td>
                  <td>{deal.offerStatus}</td>
                  <td>{deal.offerNumber}</td>
                  <td>{deal.lostReason}</td>
                  <td>{deal.linkedLeadId ? "Yes" : "Not yet"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>

    <Card className="p-5">
      <SectionHeader
        title="Exact CRM status"
        description="Literal current status from Monday or HubSpot"
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Leads</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {crmStatuses.map(row => (
              <tr key={row.status}>
                <td className="font-semibold">{row.status}</td>
                <td>{row.leads}</td>
                <td>{formatPercent(percentage(row.leads,data.leads.length))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>

    <Card className="p-5"><SectionHeader title="Lead register" description="Personal details appear only in this permission-gated operational table"/><div className="table-scroll"><table><thead><tr><th>Date</th><th>Name</th><th>Source</th><th>Exact CRM status</th><th>Stage</th><th>Service</th><th>ROBAWS match</th><th>Offer</th><th>Offer status</th><th>Offer value</th><th>Client</th><th>Won revenue</th><th>Ad cost</th><th>Campaign</th></tr></thead><tbody>{data.leads.map(lead => <tr key={lead.id} onClick={() => setSelected(lead)} className="cursor-pointer"><td>{lead.date}</td><td className="font-semibold text-[var(--ink)]">{lead.name}</td><td>{lead.source}</td><td>{lead.crmStatus}</td><td><StatusPill tone={lead.stage === "Won" ? "good" : lead.stage === "Lost" ? "bad" : "accent"}>{lead.stage}</StatusPill></td><td>{lead.service}</td><td>{lead.robawsMatchMethod}</td><td>{lead.quoteNumber}</td><td>{lead.quoteStatus}</td><td>{formatCurrency(lead.quoteValue)}</td><td><StatusPill tone={lead.isClient ? "good" : "neutral"}>{lead.isClient ? "Yes" : "No"}</StatusPill></td><td>{formatCurrency(lead.wonRevenue)}</td><td>{formatCurrency(lead.acquisitionCost)}</td><td>{lead.campaign}</td></tr>)}</tbody></table></div></Card>
    {selected && <LeadDrawer lead={selected} onClose={() => setSelected(null)}/>}
  </div>;
}

function Mini({label,value}:{label:string;value:string}) { return <div className="bg-white p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p><p className="mt-3 text-xl font-semibold">{value}</p></div>; }

function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  return <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}><aside className="drawer" role="dialog" aria-modal="true" aria-label={`${lead.name} details`} onMouseDown={e => e.stopPropagation()}><div className="flex items-start justify-between border-b border-[var(--line)] p-6"><div><div className="mb-3 flex gap-2"><StatusPill tone="accent">{lead.stage}</StatusPill></div><h2 className="text-2xl font-semibold tracking-tight">{lead.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">Created {lead.date} · {lead.daysOpen} days open</p></div><button className="icon-button" onClick={onClose} aria-label="Close lead details"><X size={18}/></button></div><div className="space-y-7 overflow-y-auto p-6"><div className="grid gap-3 text-sm"><p className="flex items-center gap-3"><Mail size={16} className="text-[var(--muted)]"/>{lead.email}</p><p className="flex items-center gap-3"><Phone size={16} className="text-[var(--muted)]"/>{lead.phone}</p><p className="flex items-center gap-3"><MapPin size={16} className="text-[var(--muted)]"/>{lead.municipality}</p></div><Detail title="Attribution"><Row label="Source" value={lead.source}/><Row label="Campaign" value={lead.campaign}/><Row label="Ad" value={lead.ad}/><Row label="UTM parameters" value={lead.utm}/></Detail><Detail title="CRM"><Row label="Source" value={lead.source}/><Row label="Exact status" value={lead.crmStatus}/><Row label="Stage" value={lead.stage}/><Row label="Service" value={lead.service}/></Detail><Detail title="Commercial / ROBAWS"><Row label="Match" value={lead.robawsMatchMethod}/><Row label="ROBAWS client" value={lead.robawsClientId}/><Row label="Status" value={lead.commercialStatus}/><Row label="Offer" value={lead.quoteNumber}/><Row label="Offer status" value={lead.quoteStatus}/><Row label="Offer value" value={formatCurrency(lead.quoteValue)}/><Row label="Client" value={lead.isClient ? "Yes" : "Not confirmed"}/><Row label="Won revenue" value={formatCurrency(lead.wonRevenue)}/></Detail><Detail title="Marketing attribution"><Row label="Campaign" value={lead.campaign}/><Row label="Ad" value={lead.ad}/><Row label="Ad cost" value={formatCurrency(lead.acquisitionCost)}/><Row label="Attribution" value={lead.attributionLevel}/><Row label="UTM parameters" value={lead.utm || "—"}/></Detail><Detail title="Timeline"><div className="relative ml-2 space-y-5 border-l border-[var(--line-strong)] pl-5"><Timeline label="Lead received" meta={lead.date}/><Timeline label={lead.stage} meta="Current stage"/></div></Detail><Detail title="Notes"><p className="text-sm leading-6 text-[var(--muted)]">{lead.notes}</p></Detail></div></aside></div>;
}
function Detail({title,children}:{title:string;children:React.ReactNode}) { return <section><h3 className="mb-3 text-xs font-bold uppercase tracking-[.12em] text-[var(--muted)]">{title}</h3><div className="space-y-3">{children}</div></section>; }
function Row({label,value}:{label:string;value:string}) { return <div className="grid grid-cols-[110px_1fr] gap-3 text-sm"><span className="text-[var(--muted)]">{label}</span><span className="break-words font-medium">{value}</span></div>; }
function Timeline({label,meta}:{label:string;meta:string}) { return <div className="relative"><span className="absolute -left-[25px] top-1 h-2 w-2 bg-[var(--ink)]"/><p className="text-sm font-semibold">{label}</p><p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]"><Clock3 size={12}/>{meta}</p></div>; }
