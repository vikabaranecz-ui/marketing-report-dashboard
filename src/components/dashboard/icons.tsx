import { Activity, Cable, Globe2, LayoutDashboard, Megaphone, Settings } from "lucide-react";

export const navItems = [
  { href: "/overview", label: "Decision Center", icon: LayoutDashboard },
  { href: "/client-journey", label: "Client Journey", icon: Activity },
  { href: "/campaigns", label: "Campaigns & Creatives", icon: Megaphone },
  { href: "/website-seo", label: "Website & SEO", icon: Globe2 },
  { href: "/integrations", label: "Data / Integrations", icon: Cable },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const sectionMeta = {
  overview: { eyebrow: "One decision view", title: "Decision Center", icon: LayoutDashboard },
  "client-journey": { eyebrow: "Person-level evidence", title: "Client Journey", icon: Activity },
  "leads-sales": { eyebrow: "Commercial detail", title: "Leads & Sales", icon: Activity },
  visits: { eyebrow: "Commercial detail", title: "Visits", icon: Activity },
  "offers-pipeline": { eyebrow: "Commercial detail", title: "Offers & Pipeline", icon: Activity },
  "sales-projects": { eyebrow: "Commercial detail", title: "Sales & Projects", icon: Activity },
  acquisition: { eyebrow: "Commercial detail", title: "Acquisition", icon: Activity },
  services: { eyebrow: "Commercial detail", title: "Services", icon: Activity },
  locations: { eyebrow: "Commercial detail", title: "Locations", icon: Activity },
  cohorts: { eyebrow: "Commercial detail", title: "Cohorts", icon: Activity },
  "sales-team": { eyebrow: "Commercial detail", title: "Sales Team", icon: Activity },
  campaigns: { eyebrow: "Paid media detail", title: "Campaigns & Creatives", icon: Megaphone },
  "website-seo": { eyebrow: "Owned demand", title: "Website & SEO", icon: Globe2 },
  integrations: { eyebrow: "Sources & quality", title: "Data / Integrations", icon: Cable },
  settings: { eyebrow: "Workspace controls", title: "Settings", icon: Settings },
} as const;

export type SectionKey = keyof typeof sectionMeta;
