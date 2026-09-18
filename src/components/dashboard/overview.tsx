"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import type { CompanyDataset } from "@/lib/data/types";
import { calculateKpis, formatCurrency, formatNumber, formatPercent, percentage } from "@/lib/metrics/kpis";
import { buildFunnelSummary } from "@/lib/metrics/client-funnel";
import { TrendChart } from "./charts";
import { Card, KpiCard, SectionHeader } from "./ui";

function delta(current: number, previous: number) { return previous === 0 ? null : ((current - previous) / previous) * 100; }

export function OverviewPage({ data }: { data: CompanyDataset }) {
  const [metric, setMetric] = useState<"spend" | "leads" | "qualified" | "revenue" | "cpl" | "cac" | "roas">("revenue");
  const { metrics, previous } = data;
  const kpi = calculateKpis(metrics);
  const commercial = buildFunnelSummary(data);
  const funnel = [
    ["Leads", commercial.leads], ["Unique", commercial.uniquePeople], ["Qualified", commercial.qualified], ["Visits", commercial.visits], ["Offers", commercial.offersSent], ["Accepted", commercial.acceptedOffers], ["CRM signed", commercial.crmSigned], ["Verified", commercial.verifiedProjects],
  ] as const;
  const attributionMissing = data.dataHealth.missingCampaign;
  const meta = data.channels.find(c => c.channel === "Meta Ads");
  const topService = [...data.services].sort((a,b) => b.revenue - a.revenue)[0];

  return <div className="space-y-6">
    <div className="kpi-grid border-l border-t border-[var(--line)]">
      <KpiCard label="Ad spend" value={formatCurrency(metrics.spend, true)} delta={delta(metrics.spend, previous.spend)} meta="Tracked paid media"/>
      <KpiCard label="CRM leads" value={formatNumber(commercial.leads)} meta={formatNumber(commercial.uniquePeople) + " unique people"}/>
      <KpiCard label="Not relevant" value={formatNumber(commercial.notRelevantPeople)} meta={formatPercent(percentage(commercial.notRelevantPeople, commercial.uniquePeople)) + " of unique people"}/>
      <KpiCard label="Visits" value={formatNumber(commercial.visits)} meta={formatPercent(percentage(commercial.visits, commercial.leads)) + " of leads"}/>
      <KpiCard label="Offers sent" value={formatNumber(commercial.offersSent)} meta={formatCurrency(commercial.sentQuotedValue) + " verified sent value"}/>
      <KpiCard label="Open pipeline" value={formatCurrency(commercial.openPipelineValue, true)} meta={formatNumber(commercial.openOffers) + " open offers"}/>
      <KpiCard label="Verified clients" value={formatNumber(commercial.verifiedProjects)} meta={formatPercent(percentage(commercial.verifiedProjects, commercial.leads)) + " lead → verified"}/>
      <KpiCard label="Attributed revenue" value={formatCurrency(commercial.verifiedRevenue, true)} meta={kpi.roas === null ? "No ROAS yet" : formatNumber(kpi.roas) + "× ROAS"}/>
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.8fr)]">
      <Card className="p-5">
        <SectionHeader title="Marketing performance" description="Commercial outcomes across the selected period" action={<select className="compact-select" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}><option value="revenue">Revenue</option><option value="spend">Spend</option><option value="leads">Leads</option><option value="qualified">Qualified leads</option><option value="cpl">CPL</option><option value="cac">CAC</option><option value="roas">ROAS</option></select>}/>
        <TrendChart data={data.trend} metric={metric} accent={data.company.accent}/>
      </Card>
      <Card className="p-5">
        <SectionHeader title="Deterministic insights" description="Only rules supported by the selected data"/>
        <div className="space-y-5">
          <Insight icon={<CheckCircle2 size={16}/>} label="Lead quality" text={`${formatNumber(commercial.notRelevantPeople)} of ${formatNumber(commercial.uniquePeople)} unique people are currently explicitly not relevant (${formatPercent(percentage(commercial.notRelevantPeople, commercial.uniquePeople))}). ${formatNumber(commercial.visits)} reached visit evidence, ${formatNumber(commercial.offersSent)} have a verified sent offer, and ${formatNumber(commercial.verifiedProjects)} have a verified project.`}/>
          {meta && (
            <Insight icon={<ArrowRight size={16}/>} label="Channel quality" text={`Meta generated ${formatPercent(percentage(meta.leads, metrics.leads))} of leads and ${formatPercent(percentage(meta.won, metrics.won))} of won projects.`}/>
          )}
          {topService && (
            <Insight icon={<ArrowRight size={16}/>} label="Service value" text={`${topService.name} produced the most attributed revenue at ${formatCurrency(topService.revenue, true)}.`}/>
          )}
          {attributionMissing > 0 && <Insight icon={<AlertTriangle size={16}/>} label="Tracking gap" text={`${attributionMissing} leads are missing campaign attribution and are excluded from campaign-level conclusions.`} warn/>}
        </div>
      </Card>
    </div>

    <Card className="p-5">
      <SectionHeader title="Full-funnel economics" description="Conversion and drop-off are measured against the previous CRM-confirmed stage"/>
      <div className="funnel-grid">
        <div className="funnel-step funnel-spend"><p>Spend</p><strong>{formatCurrency(metrics.spend, true)}</strong><span>Investment</span></div>
        {funnel.map(([label, value], index) => { const prev = index === 0 ? metrics.leads : funnel[index - 1][1]; const conversion = index === 0 ? null : percentage(value, Number(prev)); return <div className="funnel-step" key={label}><p>{label}</p><strong>{formatNumber(value)}</strong><span>{conversion === null ? "Entry volume" : `${formatPercent(conversion)} converted · ${formatPercent(conversion === null ? null : 100 - conversion)} drop-off`}</span></div>; })}
        <div className="funnel-step funnel-revenue"><p>Revenue</p><strong>{formatCurrency(commercial.verifiedRevenue, true)}</strong><span>{kpi.roas === null ? "—" : `${formatNumber(kpi.roas)}× ROAS`}</span></div>
      </div>
    </Card>

    <ChannelTable data={data}/>
    <DataHealth data={data}/>
  </div>;
}

function Insight({ icon, label, text, warn = false }: { icon: React.ReactNode; label: string; text: string; warn?: boolean }) {
  return <div className="flex gap-3"><div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center ${warn ? "bg-amber-100 text-amber-800" : "bg-[var(--accent-soft)] text-[var(--accent-ink)]"}`}>{icon}</div><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-sm leading-6 text-[var(--muted)]">{text}</p></div></div>;
}

function ChannelTable({ data }: { data: CompanyDataset }) {
  return <Card className="p-5"><SectionHeader title="Channel comparison" description="Platform activity reconciled with CRM outcomes"/><div className="table-scroll"><table><thead><tr><th>Channel</th><th>Spend</th><th>Leads</th><th>Qualified</th><th>Visits</th><th>Quotes</th><th>Won</th><th>Revenue</th><th>CPL</th><th>Qual. CPL</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>{data.channels.map(row => { const kpi = calculateKpis(row); return <tr key={row.id}><td className="font-semibold text-[var(--ink)]">{row.channel}</td><td>{formatCurrency(row.spend)}</td><td>{row.leads}</td><td>{row.qualified}</td><td>{row.visits}</td><td>{row.quotes}</td><td>{row.won}</td><td>{formatCurrency(row.revenue)}</td><td>{formatCurrency(kpi.cpl)}</td><td>{formatCurrency(kpi.qualifiedCpl)}</td><td>{formatCurrency(kpi.cac)}</td><td className="font-semibold">{kpi.roas === null ? "—" : `${formatNumber(kpi.roas)}×`}</td></tr>; })}</tbody></table></div></Card>;
}

function DataHealth({ data }: { data: CompanyDataset }) {
  const h = data.dataHealth;
  const items = [["Missing source",h.missingSource],["Missing service",h.missingService],["Missing campaign",h.missingCampaign],["Won without revenue",h.wonMissingRevenue],["Potential duplicates",h.duplicates],["Campaigns without spend",h.campaignsWithoutSpend]];
  return <Card className="p-5"><SectionHeader title="Data health" description="Tracking problems that can affect business conclusions"/><div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-6">{items.map(([label,value]) => <div className="bg-white p-4" key={label}><p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p><p className={`mt-3 text-2xl font-semibold ${Number(value) > 0 ? "text-amber-700" : "text-emerald-700"}`}>{value}</p></div>)}</div></Card>;
}
