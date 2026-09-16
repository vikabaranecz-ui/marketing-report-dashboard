import type { CampaignMetric, ChannelMetric, CompanyDataset, CompanyId, Lead, LocationMetric, ServiceMetric, TrendPoint } from "./types";

const integrations = [
  ["meta", "Meta Ads"], ["google_ads", "Google Ads"], ["ga4", "Google Analytics 4"], ["search_console", "Google Search Console"], ["google_business", "Google Business Profile"], ["monday", "CRM / Monday"], ["website_forms", "Website forms"],
].map(([provider, name], index) => ({ id: `int-${index}`, provider: provider as CompanyDataset["integrations"][number]["provider"], name, status: "Not connected" as const, lastSuccess: null, lastAttempt: null, records: 0, resource: "Not selected", errorMessage: null }));

function channels(scale: number): ChannelMetric[] {
  const rows = [
    ["Meta Ads", 8420, 486000, 9210, 312, 248, 156, 71, 42, 15, 184500],
    ["Google Ads", 6110, 131000, 6820, 221, 174, 119, 62, 37, 13, 169000],
    ["Google Organic", 0, 98000, 4140, 0, 82, 53, 29, 17, 7, 96500],
    ["Google Business Profile", 0, 44200, 1890, 0, 41, 28, 18, 11, 4, 52750],
    ["Instagram / Facebook Organic", 0, 31600, 1240, 0, 24, 12, 6, 4, 1, 13800],
    ["Referral", 0, 0, 0, 0, 22, 18, 13, 9, 5, 74100],
    ["Direct", 0, 0, 0, 0, 31, 20, 11, 7, 3, 38500],
    ["Other", 0, 0, 0, 0, 9, 3, 1, 1, 0, 0],
  ];
  return rows.map((r, i) => ({ id: `channel-${i}`, channel: r[0] as string, spend: Number(r[1]) * scale, impressions: Number(r[2]), clicks: Number(r[3]), platformConversions: Number(r[4]), leads: Math.round(Number(r[5]) * scale), qualified: Math.round(Number(r[6]) * scale), visits: Math.round(Number(r[7]) * scale), quotes: Math.round(Number(r[8]) * scale), won: Math.round(Number(r[9]) * scale), revenue: Number(r[10]) * scale }));
}

function makeTrend(scale: number): TrendPoint[] {
  return ["20 aug", "24 aug", "28 aug", "1 sep", "5 sep", "9 sep", "13 sep", "16 sep"].map((date, index) => {
    const spend = (1120 + index * 95 + (index % 2) * 180) * scale;
    const leads = Math.round((34 + index * 2 + (index % 3) * 4) * scale);
    const qualified = Math.round(leads * (0.58 + (index % 2) * 0.04));
    const revenue = (18400 + index * 3200 + (index % 3) * 5100) * scale;
    return { date, spend, leads, qualified, revenue, cpl: spend / leads, cac: spend / Math.max(1, Math.round(leads * .055)), roas: revenue / spend, sessions: Math.round(760 * scale + index * 74), conversions: leads };
  });
}

function leads(company: CompanyId, services: string[]): Lead[] {
  const cities = company === "isoprotech" ? ["Antwerpen", "Schoten", "Brasschaat", "Mortsel", "Wijnegem", "Kapellen"] : ["Antwerpen", "Berchem", "Wilrijk", "Deurne", "Edegem", "Hoboken"];
  const stages = ["New lead", "Contacted", "Qualified", "Visit booked", "Visit completed", "Quote sent", "Won", "Lost"];
  return Array.from({ length: 16 }, (_, index) => ({
    id: `${company}-lead-${index + 1}`,
    date: `2026-09-${String(16 - (index % 14)).padStart(2, "0")}`,
    name: `Demo Lead ${String(index + 1).padStart(3, "0")}`,
    email: `demo.lead.${index + 1}@example.com`,
    phone: `+32 400 00 ${String(index + 1).padStart(2, "0")}`,
    source: index % 3 === 0 ? "Google Ads" : index % 3 === 1 ? "Meta Ads" : "Google Organic",
    campaign: index % 2 === 0 ? "High intent — September" : "Project proof — Always on",
    ad: `Demo creative ${index % 4 + 1}`,
    service: services[index % services.length],
    municipality: cities[index % cities.length],
    quality: (["A", "B", "A", "C"] as const)[index % 4],
    stage: stages[index % stages.length],
    quoteValue: index % 3 === 0 ? null : 8500 + index * 1150,
    wonRevenue: index % 8 === 6 ? 24500 + index * 900 : null,
    salesperson: index % 2 === 0 ? "Nora V." : "Thomas D.",
    daysOpen: index % 8,
    notes: "Synthetic demonstration record. Follow-up captured in the activity timeline.",
    utm: `utm_source=${index % 2 ? "meta" : "google"}&utm_campaign=demo-september`,
  }));
}

function serviceRows(names: string[], scale: number): ServiceMetric[] {
  return names.map((name, index) => ({ id: `service-${index}`, name, spend: Math.round((2450 - index * 170) * scale), leads: Math.max(8, Math.round((72 - index * 7) * scale)), qualified: Math.max(4, Math.round((43 - index * 4) * scale)), visits: Math.max(2, Math.round((24 - index * 2) * scale)), quotes: Math.max(1, Math.round((15 - index) * scale)), won: Math.max(0, Math.round((6 - index * .55) * scale)), revenue: Math.max(0, (79000 - index * 8100) * scale), grossMargin: index === names.length - 1 ? null : 31 + (index % 4) * 3 }));
}

function campaignRows(scale: number): CampaignMetric[] {
  return [
    ["High intent — Search", "Google Ads", "3 ad groups", 4380, 81200, 4910, 126, 94, 51, 11, 148000, "urgent problem"],
    ["Project proof — Always on", "Meta Ads", "4 ad sets", 3610, 218000, 4220, 114, 72, 34, 7, 88900, "project proof"],
    ["Energy & comfort", "Meta Ads", "3 ad sets", 2780, 164000, 3110, 78, 51, 28, 5, 64200, "energy savings"],
    ["Brand protection", "Google Ads", "2 ad groups", 1730, 49800, 1910, 48, 35, 19, 4, 53500, "trust"],
    ["Local remarketing", "Meta Ads", "2 ad sets", 1210, 104000, 1880, 37, 21, 9, 2, 28900, "finished project"],
  ].map((r, index) => ({ id: `campaign-${index}`, name: String(r[0]), channel: String(r[1]), childLabel: String(r[2]), spend: Number(r[3]) * scale, impressions: Number(r[4]), clicks: Number(r[5]), leads: Math.round(Number(r[6]) * scale), qualified: Math.round(Number(r[7]) * scale), visits: Math.round(Number(r[8]) * scale), won: Math.round(Number(r[9]) * scale), revenue: Number(r[10]) * scale, angle: String(r[11]) }));
}

function locationRows(company: CompanyId, scale: number): LocationMetric[] {
  const names = company === "isoprotech" ? ["Antwerpen", "Schoten", "Brasschaat", "Mortsel", "Kapellen", "Wijnegem"] : ["Antwerpen", "Berchem", "Wilrijk", "Deurne", "Edegem", "Hoboken"];
  return names.map((municipality, index) => ({ municipality, leads: Math.round((88 - index * 9) * scale), qualified: Math.round((54 - index * 6) * scale), won: Math.max(1, Math.round((9 - index) * scale)), revenue: (104000 - index * 9500) * scale, spend: (3100 - index * 260) * scale }));
}

function dataset(company: CompanyId): CompanyDataset {
  const isIso = company === "isoprotech";
  const scale = isIso ? 1 : .78;
  const serviceNames = isIso ? ["Dakrenovatie", "Dakisolatie", "Gevelisolatie", "Gevelrenovatie", "Dakkapel", "Asbest", "Other"] : ["Badkamerrenovatie", "Totaalrenovatie", "Interieurafwerking", "Gyproc / pleisterwerken", "Vloeren", "Schilderwerken", "Tegelwerken", "Other"];
  const channelRows = channels(scale);
  const spend = channelRows.reduce((s, row) => s + row.spend, 0);
  const total = (key: "leads" | "qualified" | "visits" | "quotes" | "won" | "revenue") => channelRows.reduce((s, row) => s + row[key], 0);
  return {
    company: { id: company, name: isIso ? "ISOPROTECH" : "RENO RANGERS", shortName: isIso ? "ISO" : "RR", accent: isIso ? "#ceff3d" : "#ff6a3d" },
    periodLabel: "18 Aug — 16 Sep 2026",
    comparisonLabel: "vs 19 Jul — 17 Aug",
    metrics: { spend, leads: total("leads"), qualified: total("qualified"), visits: total("visits"), quotes: total("quotes"), won: total("won"), revenue: total("revenue"), grossProfit: total("revenue") * (isIso ? .34 : .31) },
    previous: { spend: spend * .94, leads: total("leads") * .91, qualified: total("qualified") * .88, visits: total("visits") * .95, quotes: total("quotes") * .92, won: total("won") * .86, revenue: total("revenue") * .82 },
    channels: channelRows,
    leads: leads(company, serviceNames),
    services: serviceRows(serviceNames, scale),
    campaigns: campaignRows(scale),
    trend: makeTrend(scale),
    locations: locationRows(company, scale),
    website: { users: Math.round(5240 * scale), sessions: Math.round(6810 * scale), newUsers: Math.round(4190 * scale), engagedSessions: Math.round(4380 * scale), formSubmissions: Math.round(216 * scale), whatsappClicks: Math.round(94 * scale), phoneClicks: Math.round(137 * scale), quoteRequests: Math.round(183 * scale) },
    seo: { impressions: Math.round(184000 * scale), clicks: Math.round(6420 * scale), ctr: 3.49, position: isIso ? 11.8 : 13.2, brandedShare: isIso ? 38 : 31 },
    integrations,
    dataHealth: { missingSource: isIso ? 19 : 11, missingService: isIso ? 8 : 13, missingCampaign: isIso ? 62 : 43, wonMissingRevenue: 2, duplicates: 4, campaignsWithoutSpend: 1, daysSinceSync: null },
  };
}

export const demoDatasets: Record<CompanyId, CompanyDataset> = {
  isoprotech: dataset("isoprotech"),
  "reno-rangers": dataset("reno-rangers"),
};

export const demoCompanies = Object.values(demoDatasets).map((item) => item.company);
