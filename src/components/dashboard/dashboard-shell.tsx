"use client";
import { useMemo, useState } from "react";
import type { DashboardBootstrap } from "@/lib/data/repository";
import { Sidebar } from "./sidebar";
import { TopControls } from "./top-controls";
import { sectionMeta, type SectionKey } from "./icons";
import { OverviewPage } from "./overview";
import { LeadsSalesPage } from "./leads-sales";
import { ClientJourneyPage, CohortsPage, OffersPipelinePage, SalesProjectsPage, SalesTeamPage, VisitsPage } from "./journey-pages";
import { AcquisitionPage, IntegrationsPage, LocationsPage, ServicesPage, SettingsPage, WebsiteSeoPage } from "./detail-pages";
import { DataHealthPage, FunnelPage, RevenuePage, SourcesCampaignsPage } from "./control-pages";
import { EmptyState } from "./ui";

export function DashboardShell({ bootstrap, section }: { bootstrap: DashboardBootstrap; section: SectionKey }) {
  const [companyId, setCompanyId] = useState(bootstrap.companies[0]?.id ?? "");
  const data = bootstrap.datasets[companyId];
  const meta = sectionMeta[section];
  const Page = useMemo(() => ({ overview: OverviewPage, funnel: FunnelPage, campaigns: SourcesCampaignsPage, "client-journey": ClientJourneyPage, "offers-pipeline": OffersPipelinePage, revenue: RevenuePage, "website-seo": WebsiteSeoPage, "data-health": DataHealthPage, "leads-sales": LeadsSalesPage, visits: VisitsPage, "sales-projects": SalesProjectsPage, acquisition: AcquisitionPage, services: ServicesPage, locations: LocationsPage, cohorts: CohortsPage, "sales-team": SalesTeamPage, integrations: IntegrationsPage, settings: SettingsPage })[section], [section]);
  function exportCsv() {
    if (!data) return;
    const rows = [["Channel","Spend","Leads","Qualified","Visits","Quotes","Won","Revenue"], ...data.channels.map(c => [c.channel,c.spend,c.leads,c.qualified,c.visits,c.quotes,c.won,c.revenue])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${data.company.name.toLowerCase().replaceAll(" ","-")}-channel-performance.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  }
  const liveOnly = ["funnel","campaigns","client-journey","leads-sales","visits","offers-pipeline","revenue","data-health","sales-projects","cohorts","sales-team"].includes(section);
  return <div className="app-shell"><Sidebar/><main className="main-shell"><TopControls companies={bootstrap.companies} companyId={companyId} onCompanyChange={setCompanyId} onExport={exportCsv} selectedMonth={bootstrap.selectedMonth} availableMonths={bootstrap.availableMonths}/><div className="page-wrap"><header className="page-header"><div><div className="flex items-center gap-2"><p className="eyebrow">{meta.eyebrow}</p>{bootstrap.mode === "demo" && <span className="demo-badge">Demo data</span>}</div><h1>{meta.title}</h1><p>{data ? `${data.company.name} · ${data.periodLabel} · ${data.comparisonLabel}` : "No company available"}</p></div><div className="company-mark" style={{background:data?.company.accent}}>{data?.company.shortName ?? "—"}</div></header>{data ? liveOnly && bootstrap.mode === "demo" ? <EmptyState title="Live data required" body="Commercial funnel pages never show synthetic client, offer or project data. Connect Supabase and the CRM / ROBAWS sources to use this page."/> : <Page data={data}/> : <EmptyState title="No companies available" body="Ask an administrator to assign your account to a company."/>}</div></main></div>;
}
