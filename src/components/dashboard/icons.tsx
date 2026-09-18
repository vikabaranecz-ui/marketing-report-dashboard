import { Activity, BarChart3, Building2, Cable, Crosshair, Globe2, LayoutDashboard, MapPin, Megaphone, Settings, UsersRound, Wrench } from "lucide-react";

export const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/client-journey", label: "Client Journey", icon: Activity },
  { href: "/leads-sales", label: "Leads", icon: UsersRound },
  { href: "/visits", label: "Visits", icon: MapPin },
  { href: "/offers-pipeline", label: "Offers & Pipeline", icon: BarChart3 },
  { href: "/sales-projects", label: "Sales & Projects", icon: Building2 },
  { href: "/acquisition", label: "Acquisition", icon: Crosshair },
  { href: "/services", label: "Services", icon: Wrench },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/cohorts", label: "Cohorts", icon: Activity },
  { href: "/sales-team", label: "Sales Team", icon: UsersRound },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/website-seo", label: "Website & SEO", icon: Globe2 },
  { href: "/integrations", label: "Data / Integrations", icon: Cable },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const sectionMeta = {
  overview: { eyebrow: "Executive view", title: "Marketing performance", icon: BarChart3 },
  "client-journey": { eyebrow: "Client funnel", title: "Client Journey", icon: Activity },
  "leads-sales": { eyebrow: "Lead evidence", title: "Leads", icon: UsersRound },
  visits: { eyebrow: "Sales activity", title: "Visits", icon: MapPin },
  "offers-pipeline": { eyebrow: "Commercial pipeline", title: "Offers & Pipeline", icon: BarChart3 },
  "sales-projects": { eyebrow: "Commercial truth", title: "Sales & Projects", icon: Building2 },
  acquisition: { eyebrow: "Channel economics", title: "Acquisition", icon: Crosshair },
  services: { eyebrow: "Commercial outcomes", title: "Services", icon: Wrench },
  locations: { eyebrow: "Geographic performance", title: "Locations", icon: MapPin },
  cohorts: { eyebrow: "Acquisition timing", title: "Cohorts", icon: Activity },
  "sales-team": { eyebrow: "Sales execution", title: "Sales Team", icon: UsersRound },
  campaigns: { eyebrow: "Paid media detail", title: "Campaigns", icon: Megaphone },
  "website-seo": { eyebrow: "Owned demand", title: "Website & SEO", icon: Globe2 },
  integrations: { eyebrow: "Sources & quality", title: "Data / Integrations", icon: Activity },
  settings: { eyebrow: "Workspace controls", title: "Settings", icon: Building2 },
} as const;

export type SectionKey = keyof typeof sectionMeta;
