import { Activity, BadgeEuro, BarChart3, Building2, Cable, CalendarCheck2, Crosshair, FileText, Globe2, LayoutDashboard, Layers3, MapPin, Megaphone, Settings, UserRoundCheck, UsersRound, Workflow, Wrench } from "lucide-react";

export const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/client-journey", label: "Client Journey", icon: Workflow },
  { href: "/leads-sales", label: "Leads", icon: UsersRound },
  { href: "/visits", label: "Visits", icon: CalendarCheck2 },
  { href: "/offers-pipeline", label: "Offers & Pipeline", icon: FileText },
  { href: "/sales-projects", label: "Sales & Projects", icon: BadgeEuro },
  { href: "/acquisition", label: "Acquisition", icon: Crosshair },
  { href: "/services", label: "Services", icon: Wrench },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/cohorts", label: "Cohorts", icon: Layers3 },
  { href: "/sales-team", label: "Sales Team", icon: UserRoundCheck },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/website-seo", label: "Website & SEO", icon: Globe2 },
  { href: "/integrations", label: "Data / Integrations", icon: Cable },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const sectionMeta = {
  overview: { eyebrow: "Executive view", title: "Marketing performance", icon: BarChart3 },
  "client-journey": { eyebrow: "Client funnel", title: "Client Journey", icon: Workflow },
  "leads-sales": { eyebrow: "Lead evidence", title: "Leads", icon: UsersRound },
  visits: { eyebrow: "Sales activity", title: "Visits", icon: CalendarCheck2 },
  "offers-pipeline": { eyebrow: "Commercial pipeline", title: "Offers & Pipeline", icon: FileText },
  "sales-projects": { eyebrow: "Commercial truth", title: "Sales & Projects", icon: BadgeEuro },
  acquisition: { eyebrow: "Channel economics", title: "Acquisition", icon: Crosshair },
  services: { eyebrow: "Commercial outcomes", title: "Services", icon: Wrench },
  locations: { eyebrow: "Geographic performance", title: "Locations", icon: MapPin },
  cohorts: { eyebrow: "Acquisition timing", title: "Cohorts", icon: Layers3 },
  "sales-team": { eyebrow: "Sales execution", title: "Sales Team", icon: UserRoundCheck },
  campaigns: { eyebrow: "Paid media detail", title: "Campaigns", icon: Megaphone },
  "website-seo": { eyebrow: "Owned demand", title: "Website & SEO", icon: Globe2 },
  integrations: { eyebrow: "Sources & quality", title: "Data / Integrations", icon: Activity },
  settings: { eyebrow: "Workspace controls", title: "Settings", icon: Building2 },
} as const;

export type SectionKey = keyof typeof sectionMeta;
