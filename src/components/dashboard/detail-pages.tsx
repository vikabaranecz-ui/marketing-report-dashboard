"use client";

import { useState } from "react";
import { AlertCircle, Check, ChevronDown, Search, ShieldCheck } from "lucide-react";
import type { CampaignMetric, CompanyDataset } from "@/lib/data/types";
import { calculateKpis, formatCurrency, formatNumber, formatPercent, percentage, safeDivide } from "@/lib/metrics/kpis";
import { buildJourneyRows, campaignPipelineRows, locationPipelineRows, servicePipelineRows, sourcePipelineRows } from "@/lib/metrics/client-funnel";
import { buildOverviewAnalytics, normalizeAcquisitionSource, PAID_ACQUISITION_SOURCES } from "@/lib/metrics/business-overview";
import { ComparisonBars, TrendChart } from "./charts";
import { Card, EmptyState, KpiCard, SectionHeader, StatusPill } from "./ui";
import { IntegrationCenter } from "./integration-center";
import { RecordDrilldownDrawer, type RecordDrilldown } from "./record-drilldown";

export function AcquisitionPage({ data }: { data: CompanyDataset }) {
  const paid = data.channels.filter(c => c.spend > 0);
  const platform = paid.reduce((s,c)=>s+c.platformConversions,0);
  const analytics = buildOverviewAnalytics(data,{source:"all",campaign:"all"});
  const paidSourceRows = analytics.sourceRows.filter(row=>PAID_ACQUISITION_SOURCES.has(row.source));
  const paidJourneyRows = analytics.allRows.filter(row=>PAID_ACQUISITION_SOURCES.has(normalizeAcquisitionSource(row.lead.source)));
  const spend = analytics.economics.coveredSpend;
  const leads = analytics.economics.coveredLeads;
  const notRelevant = paidJourneyRows.filter(row=>row.isNotRelevant).length;
  const visits = analytics.economics.coveredVisits;
  const won = analytics.economics.attributableCustomers;
  const paidValue = analytics.economics.cohortPaidValue;
  const sourceRows = sourcePipelineRows(data);
  const googleAds = data.integrations.find(item => item.provider === "google_ads");
  const googleSpendMissing = googleAds?.status === "Connected" && !googleAds.lastSuccess;

  return <div className="space-y-6">
    <div className="kpi-grid border-l border-t border-[var(--line)]">
      <KpiCard label="Covered acquisition spend" value={formatCurrency(spend,true)} meta={analytics.economics.missingCostSources.length ? "Partial cost coverage" : "Paid sources with known cost"}/>
      <KpiCard label="Known paid-source leads" value={formatNumber(leads)} meta={`${formatCurrency(analytics.economics.cpl)} CPL · ${formatCurrency(analytics.economics.cplCoveredSpend)} spend has lead-count coverage`}/>
      <KpiCard label="Not relevant" value={formatNumber(notRelevant)} meta={`${formatPercent(percentage(notRelevant,paidJourneyRows.length))} of paid-source CRM people`}/>
      <KpiCard label="Visited" value={formatNumber(visits)} meta={`${formatPercent(percentage(visits,paidJourneyRows.length))} of CRM-tracked paid-source people`}/>
      <KpiCard label="Clients" value={formatNumber(won)} meta={`${formatPercent(percentage(won,paidJourneyRows.length))} CRM-tracked → client`}/>
      <KpiCard label="CAC" value={formatCurrency(analytics.economics.cac)} meta="Covered spend / attributable clients"/>
      <KpiCard label="Platform leads" value={formatNumber(platform)} meta="Directional ad-platform count"/>
      <KpiCard label="Paid value" value={formatCurrency(paidValue,true)} meta={analytics.economics.cohortCashRoas===null?"—":`${formatNumber(analytics.economics.cohortCashRoas)}× paid-value ROAS`}/> 
    </div>

    {googleSpendMissing && <div className="callout"><AlertCircle size={18}/><div><strong>Google Ads platform sync is incomplete.</strong><p>Verified manual Google Ads spend is still included in source economics where available; impressions, clicks and other platform-delivery fields remain unavailable until the Google Ads sync succeeds.</p></div></div>}
    <div className="callout"><AlertCircle size={18}/><div><strong>Platform conversions are directional.</strong><p>They are shown separately from CRM-confirmed leads, visits, clients, and revenue.</p></div></div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-5"><SectionHeader title="Spend vs attributable paid value" description="Paid acquisition sources with known cost"/><ComparisonBars accent={data.company.accent} data={paidSourceRows.filter(row=>row.spend!==null).map(row=>({name:row.source,value:Number(row.spend??0),secondary:row.paidValue}))}/></Card>
      <Card className="p-5"><SectionHeader title="Synced CRM lead cost trend" description="Dated synced spend ÷ dated CRM leads only. Manual YTD supplier spend and supplier-only leads are not spread across days without evidence."/><TrendChart data={data.trend} metric="cpl" accent={data.company.accent}/></Card>
    </div>

    <Card className="p-5">
      <SectionHeader title="Paid acquisition source detail" description="Manual supplier evidence and CRM attribution use one source-economics model. Supplier lead totals do not inflate company-wide unique CRM leads."/>
      <div className="table-scroll"><table>
        <thead><tr><th>Source</th><th>Spend</th><th>Leads</th><th>Qualified</th><th>Visits</th><th>Offers</th><th>Clients</th><th>Project value excl. VAT</th><th>Paid value</th><th>CPL</th><th>CAC</th><th>Paid ROAS</th></tr></thead>
        <tbody>{paidSourceRows.map(row=><tr key={row.source}><td className="font-semibold">{row.source}</td><td>{row.spend===null?"Cost missing":formatCurrency(row.spend)}</td><td>{row.deliveredLeads===null&&row.leads===0&&row.customers>0?<StatusPill tone="warn">Lead count missing</StatusPill>:<>{formatNumber(row.deliveredLeads??row.leads)}{row.deliveredLeads!==null&&<small className="block text-[var(--muted)]">{formatNumber(row.leads)} CRM-attributed</small>}</>}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offers}</td><td>{row.attributableClients}</td><td>{formatCurrency(row.projectValueExclVat)}</td><td>{formatCurrency(row.paidValue)}</td><td>{formatCurrency(row.cpl)}</td><td>{formatCurrency(row.cac)}</td><td className="font-semibold">{row.cohortCashRoas===null?"—":`${formatNumber(row.cohortCashRoas)}×`}</td></tr>)}</tbody>
      </table></div>
    </Card>

    <Card className="p-5">
      <SectionHeader title="CRM-tracked source → pipeline → revenue" description="This table is the operational CRM funnel only. Supplier-only leads are intentionally excluded because they have no CRM stage/date; source economics above includes verified supplier totals."/>
      <div className="table-scroll"><table>
        <thead><tr><th>Reporting source</th><th>CRM-tracked people</th><th>Not relevant</th><th>Qualified</th><th>Visits</th><th>Offers created</th><th>Sent</th><th>Sent €</th><th>Open sent €</th><th>CRM signed</th><th>Verified clients</th><th>Revenue</th></tr></thead>
        <tbody>{sourceRows.map(row => <tr key={row.source}><td className="font-semibold">{row.source}</td><td>{row.leads}</td><td>{row.notRelevant}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offersCreated}</td><td>{row.offers}</td><td>{formatCurrency(row.sentQuotedValue)}</td><td>{formatCurrency(row.openPipeline)}</td><td>{row.signed}</td><td>{row.verified}</td><td className="font-semibold">{formatCurrency(row.revenue)}</td></tr>)}</tbody>
      </table></div>
    </Card>
  </div>;
}

export function ServicesPage({ data }: { data: CompanyDataset }) {
  const pipeline = servicePipelineRows(data);
  const top=[...pipeline].sort((a,b)=>b.revenue-a.revenue)[0];
  const spendByService = new Map(data.services.map(row => [row.name, row.spend]));
  return <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
      <Card className="p-5"><SectionHeader title="Revenue by service" description="Verified commercial value, not lead volume alone"/><ComparisonBars accent={data.company.accent} data={pipeline.slice(0,6).map(row=>({name:row.key.split(" ")[0],value:row.revenue}))}/></Card>
      <Card className="p-5"><SectionHeader title="Strongest verified outcome"/><p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--muted)]">Highest verified revenue</p><p className="mt-3 text-3xl font-semibold tracking-tight">{top?.key??"—"}</p><p className="mt-2 text-lg text-[var(--muted)]">{top?formatCurrency(top.revenue,true):"—"}</p><p className="mt-6 border-t border-[var(--line)] pt-5 text-sm leading-6 text-[var(--muted)]">Each service uses the same client journey: unique person → qualified → visit → offer created → sent → signed → verified project.</p></Card>
    </div>
    <Card className="p-5"><SectionHeader title="Service funnel & economics" description="CRM-tracked people only. Supplier-only leads cannot be assigned to a service without CRM evidence; offer values use verified ROBAWS evidence."/><div className="table-scroll"><table><thead><tr><th>Service</th><th>Spend</th><th>CRM-tracked people</th><th>Qualified</th><th>Visits</th><th>Offers created</th><th>Sent</th><th>Sent €</th><th>Open sent €</th><th>Verified</th><th>Revenue</th><th>CPL</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>{pipeline.map(row=>{const spend=spendByService.get(row.key)??0;return <tr key={row.key}><td className="font-semibold">{row.key}</td><td>{formatCurrency(spend)}</td><td>{row.leads}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offersCreated}</td><td>{row.offersSent}</td><td>{formatCurrency(row.sentQuotedValue)}</td><td>{formatCurrency(row.openPipeline)}</td><td>{row.verified}</td><td className="font-semibold">{formatCurrency(row.revenue)}</td><td>{formatCurrency(safeDivide(spend,row.leads))}</td><td>{formatCurrency(safeDivide(spend,row.verified))}</td><td>{spend?formatNumber(row.revenue/spend)+"×":"—"}</td></tr>})}</tbody></table></div></Card>
  </div>;
}

export function CampaignsPage({ data }: { data: CompanyDataset }) {
  const [open,setOpen]=useState<string|null>(data.campaigns[0]?.id??null);
  const pipeline=campaignPipelineRows(data);
  return <div className="space-y-6">
    <Card className="p-5"><SectionHeader title="Campaign delivery" description="Platform delivery and tracked spend"/><div className="table-scroll"><table><thead><tr><th>Campaign</th><th>Channel</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>CPC</th><th>Leads</th><th>Qualified</th><th>Visits</th><th>Won</th><th>Revenue</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>{data.campaigns.map(row=><CampaignRow key={row.id} row={row} open={open===row.id} toggle={()=>setOpen(open===row.id?null:row.id)}/>)}</tbody></table></div></Card>
    <Card className="p-5"><SectionHeader title="Campaign client funnel" description="CRM-tracked campaign people only. Supplier-only leads have no deterministic campaign/date and are not guessed into campaign results."/><div className="table-scroll"><table><thead><tr><th>Campaign</th><th>CRM-tracked people</th><th>Not relevant</th><th>Qualified</th><th>Visits</th><th>Offers created</th><th>Sent</th><th>Sent €</th><th>Open sent €</th><th>Signed</th><th>Verified</th><th>Revenue</th></tr></thead><tbody>{pipeline.map(row=><tr key={row.key}><td className="font-semibold">{row.key}</td><td>{row.leads}</td><td>{row.notRelevant}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offersCreated}</td><td>{row.offersSent}</td><td>{formatCurrency(row.sentQuotedValue)}</td><td>{formatCurrency(row.openPipeline)}</td><td>{row.signed}</td><td>{row.verified}</td><td className="font-semibold">{formatCurrency(row.revenue)}</td></tr>)}</tbody></table></div></Card>
    <div className="grid gap-6 xl:grid-cols-2"><Card className="p-5"><SectionHeader title="Creative angles" description="Ranked by customers and revenue, not CTR alone"/><div className="space-y-1">{[...data.campaigns].sort((a,b)=>b.revenue-a.revenue).map((item,i)=><div className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-[var(--line)] py-3 last:border-0" key={item.id}><span className="text-sm text-[var(--muted)]">0{i+1}</span><div><p className="text-sm font-semibold capitalize">{item.angle}</p><p className="text-xs text-[var(--muted)]">{item.leads} leads · {item.qualified} qualified · {item.won} customers</p></div><span className="text-sm font-semibold">{formatCurrency(item.revenue,true)}</span></div>)}</div></Card><Card className="p-5"><SectionHeader title="Revenue by campaign" description="Verified marketing-attributed revenue"/><ComparisonBars data={data.campaigns.map(item=>({name:item.name.split(" — ")[0],value:item.revenue}))} accent={data.company.accent}/></Card></div>
  </div>;
}
function CampaignRow({row,open,toggle}:{row:CampaignMetric;open:boolean;toggle:()=>void}) { const k=calculateKpis(row); return <><tr onClick={toggle} className="cursor-pointer"><td className="font-semibold"><span className="inline-flex items-center gap-2"><ChevronDown size={14} className={open?"rotate-180":""}/>{row.name}</span></td><td>{row.channel}</td><td>{formatCurrency(row.spend)}</td><td>{formatNumber(row.impressions)}</td><td>{formatNumber(row.clicks)}</td><td>{formatPercent(percentage(row.clicks,row.impressions))}</td><td>{formatCurrency(safeDivide(row.spend,row.clicks))}</td><td>{row.leads}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.won}</td><td>{formatCurrency(row.revenue)}</td><td>{formatCurrency(k.cac)}</td><td>{k.roas===null?"—":`${formatNumber(k.roas)}×`}</td></tr>{open&&<tr className="drill-row"><td colSpan={14}><div className="flex flex-wrap items-center gap-4 py-2 pl-7 text-sm"><StatusPill tone="neutral">{row.childLabel}</StatusPill><span>Creative angle: <strong className="capitalize">{row.angle}</strong></span><span>Qualified rate: <strong>{formatPercent(percentage(row.qualified,row.leads))}</strong></span><span>Sales rate: <strong>{formatPercent(percentage(row.won,row.leads))}</strong></span></div></td></tr>}</>; }

export function WebsiteSeoPage({ data }: { data: CompanyDataset }) {
  const w = data.website;
  const s = data.seo;
  const gbpConnection = data.integrations.find(item => item.provider === "google_business");
  const hasGbpPerformance = Boolean(data.gbp && (data.gbp.profileViews + data.gbp.websiteClicks + data.gbp.calls + data.gbp.directionRequests) > 0);

  return <div className="space-y-6">
    <div className="kpi-grid kpi-grid-six border-l border-t border-[var(--line)]">
      <KpiCard label="Users" value={formatNumber(w.users)}/>
      <KpiCard label="Sessions" value={formatNumber(w.sessions)}/>
      <KpiCard label="New users" value={formatNumber(w.newUsers)}/>
      <KpiCard label="Engaged sessions" value={formatNumber(w.engagedSessions)} meta={formatPercent(percentage(w.engagedSessions,w.sessions))}/>
      <KpiCard label="Search clicks" value={formatNumber(s.clicks)} meta="Search Console"/>
      <KpiCard label="Search impressions" value={formatNumber(s.impressions)} meta="Search Console"/>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-5"><SectionHeader title="Sessions trend" description="Google Analytics 4"/><TrendChart data={data.trend} metric="sessions" accent={data.company.accent}/></Card>
      <Card className="p-5">
        <SectionHeader title="Search performance" description="Google Search Console"/>
        <div className="grid grid-cols-2 gap-px bg-[var(--line)]"><Mini label="Impressions" value={formatNumber(s.impressions)}/><Mini label="Clicks" value={formatNumber(s.clicks)}/><Mini label="CTR" value={formatPercent(s.ctr)}/><Mini label="Avg. position" value={formatNumber(s.position)}/></div>
        {s.brandedShare === null ? <p className="mt-4 bg-[var(--surface)] p-3 text-xs leading-5 text-[var(--muted)]">Branded vs non-branded is not shown because Search Console rows have not been classified. The dashboard does not assume unclassified queries are non-branded.</p> : <div className="mt-5"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Branded vs non-branded</p><div className="flex h-3 overflow-hidden bg-slate-100"><div className="bg-[var(--ink)]" style={{width:`${s.brandedShare}%`}}/><div className="bg-[var(--accent)]" style={{width:`${100-s.brandedShare}%`}}/></div><div className="mt-2 flex justify-between text-xs text-[var(--muted)]"><span>{formatPercent(s.brandedShare)} branded</span><span>{formatPercent(100-s.brandedShare)} non-branded</span></div></div>}
      </Card>
    </div>

    <Card className="p-5">
      <SectionHeader title="Content performance" description="Organic / social content needs its own connected performance source before it can be judged."/>
      <EmptyState title="Content performance is not connected yet" body="The current reporting model has website, Search Console and Google Business data, but no trustworthy post/reel/content-performance feed. No engagement or content ROI is fabricated."/>
    </Card>

    <Card className="p-5">
      <SectionHeader title="Google Business Profile" description="Only metrics actually returned by the GBP Performance API"/>
      {hasGbpPerformance && data.gbp ? <div className="grid grid-cols-2 gap-px bg-[var(--line)] md:grid-cols-4"><Mini label="Profile views" value={formatNumber(data.gbp.profileViews)}/><Mini label="Website clicks" value={formatNumber(data.gbp.websiteClicks)}/><Mini label="Calls" value={formatNumber(data.gbp.calls)}/><Mini label="Directions" value={formatNumber(data.gbp.directionRequests)}/></div> : <EmptyState title={gbpConnection?.status === "Connected" ? "Google Business Profile connected — no reportable data yet" : "Google Business Profile not connected"} body={gbpConnection?.resource === "Not selected" ? "No Business Profile location is selected. Account/location discovery must succeed before data can be synced." : gbpConnection?.errorMessage ?? "Connect and sync a Business Profile location to load profile views, website clicks, calls and directions."}/>}
    </Card>
  </div>;
}

export function LocationsPage({ data }: { data: CompanyDataset }) {
  const pipeline=locationPipelineRows(data);
  const rows=buildJourneyRows(data);
  const [search,setSearch]=useState("");
  const [showAll,setShowAll]=useState(false);
  const [drilldown,setDrilldown]=useState<RecordDrilldown|null>(null);
  const filtered=pipeline.filter(row=>!search||row.key.toLowerCase().includes(search.toLowerCase()));
  const visibleLocations=(search||showAll)?filtered:filtered.slice(0,20);
  const chartLocations=filtered.slice(0,12);
  const openLocation=(location:string)=>{
    const group=rows.filter(row=>(row.lead.municipality||"Unknown")===location);
    const ids=new Set(group.flatMap(row=>row.leadIds));
    setDrilldown({
      title:location+" clients",
      subtitle:data.periodLabel,
      leads:group.map(row=>row.lead),
      offers:(data.commercialOffers??[]).filter(item=>ids.has(item.leadId)),
      projects:(data.commercialProjects??[]).filter(item=>Boolean(item.leadId&&ids.has(item.leadId))),
      invoices:(data.commercialInvoices??[]).filter(item=>Boolean(item.leadId&&ids.has(item.leadId))),
    });
  };
  return <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]"><Card className="p-5"><SectionHeader title="Qualified people by municipality" description="Deduplicated CRM-tracked people. Location uses CRM municipality first, then the matched ROBAWS client city when CRM is empty."/><ComparisonBars data={chartLocations.map(row=>({name:row.key,value:row.qualified}))} accent={data.company.accent}/></Card><Card className="p-5"><SectionHeader title="Revenue by municipality" description="Verified project value using the same CRM → ROBAWS location fallback."/><ComparisonBars data={chartLocations.map(row=>({name:row.key,value:row.revenue}))} accent="#191c1f"/></Card></div>
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><SectionHeader title="CRM-tracked leads by location" description="Click a municipality to see the exact CRM-tracked people and commercial records behind it. Supplier-only leads have no reliable location record here."/><label className="flex min-w-[260px] items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search municipality…" className="h-10 w-full outline-none"/></label></div>
      <div className="table-scroll"><table><thead><tr><th>Municipality</th><th>CRM-tracked people</th><th>Not relevant</th><th>Qualified</th><th>Visits</th><th>People with offer</th><th>Sent</th><th>Sent €</th><th>Open sent €</th><th>Verified</th><th>Revenue</th></tr></thead><tbody>{visibleLocations.map(row=><tr key={row.key}><td className="font-semibold"><button type="button" className="underline decoration-transparent underline-offset-4 hover:decoration-current" onClick={()=>openLocation(row.key)}>{row.key}</button></td><td>{row.leads}</td><td>{row.notRelevant}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.offersCreated}</td><td>{row.offersSent}</td><td>{formatCurrency(row.sentQuotedValue)}</td><td>{formatCurrency(row.openPipeline)}</td><td>{row.verified}</td><td className="font-semibold">{formatCurrency(row.revenue)}</td></tr>)}</tbody></table></div>
      {!search&&filtered.length>20&&<div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--muted)]"><span>{showAll?`Showing all ${filtered.length} municipalities`:`Showing top 20 of ${filtered.length}`}</span><button type="button" className="button-secondary" onClick={()=>setShowAll(value=>!value)}>{showAll?"Show less":"Show all"}</button></div>}
    </Card>
    {drilldown&&<RecordDrilldownDrawer data={data} selection={drilldown} onClose={()=>setDrilldown(null)}/>}
  </div>;
}

export function IntegrationsPage({ data }: { data: CompanyDataset }) {
  const h=data.dataHealth;
  return <div className="space-y-6"><IntegrationCenter companyId={data.company.id} integrations={data.integrations}/><Card className="p-5"><SectionHeader title="Data health audit" description="Issues are exposed instead of silently guessed"/><div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-4"><Mini label="Leads missing source" value={String(h.missingSource)}/><Mini label="Missing service" value={String(h.missingService)}/><Mini label="Missing campaign" value={String(h.missingCampaign)}/><Mini label="Won without revenue" value={String(h.wonMissingRevenue)}/><Mini label="Potential duplicates" value={String(h.duplicates)}/><Mini label="Campaigns without spend" value={String(h.campaignsWithoutSpend)}/><Mini label="Days since sync" value={h.daysSinceSync===null?"—":String(h.daysSinceSync)}/><Mini label="Schema status" value="Ready"/></div></Card></div>;
}

export function SettingsPage({ data }: { data: CompanyDataset }) {
  return <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><Card className="p-5"><SectionHeader title="Company settings" description="Reporting configuration for this client"/><div className="form-grid"><Field label="Company name" value={data.company.name}/><Field label="Currency" value="EUR — Euro"/><Field label="Timezone" value="Europe/Brussels"/><Field label="Default attribution" value="First touch"/><Field label="Reporting margin" value="Use service-level margin"/><Field label="Data retention" value="No automatic deletion"/></div><button className="button-primary mt-6"><Check size={15}/> Save changes</button></Card><Card className="p-5"><SectionHeader title="Access model"/><div className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center bg-[var(--accent-soft)]"><ShieldCheck size={18}/></div><div><p className="font-semibold">Row-level company isolation</p><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Agency admins can access all organization companies. Client users only see companies assigned through company_users.</p></div></div><div className="mt-6 space-y-3">{["super_admin","agency_admin","company_admin","viewer"].map((role,i)=><div className="flex items-center justify-between border-b border-[var(--line)] py-3 text-sm" key={role}><span className="font-medium">{role}</span><span className="text-[var(--muted)]">{i<2?"Agency scope":"Assigned companies"}</span></div>)}</div></Card></div>;
}

function Mini({label,value}:{label:string;value:string}) { return <div className="bg-white p-4"><p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p><p className="mt-3 text-xl font-semibold">{value}</p></div>; }
function Field({label,value}:{label:string;value:string}) { return <label><span>{label}</span><input value={value} readOnly/></label>; }
