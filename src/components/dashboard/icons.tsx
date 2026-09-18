import { Activity, Database, Euro, FileText, GitBranch, Globe2, LayoutDashboard, Megaphone, Settings, UsersRound } from "lucide-react";

export const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/funnel", label: "Funnel", icon: GitBranch },
  { href: "/campaigns", label: "Sources & Campaigns", icon: Megaphone },
  { href: "/client-journey", label: "Client Map", icon: UsersRound },
  { href: "/offers-pipeline", label: "Offers & Pipeline", icon: FileText },
  { href: "/revenue", label: "Revenue", icon: Euro },
  { href: "/website-seo", label: "Website / SEO / Content", icon: Globe2 },
  { href: "/data-health", label: "Data Health", icon: Database },
] as const;

export const sectionMeta = {
  overview: { eyebrow: "Marketing → sales → revenue", title: "Marketing Control Center", icon: LayoutDashboard },
  funnel: { eyebrow: "Leakage & conversion", title: "Funnel", icon: GitBranch },
  campaigns: { eyebrow: "Source economics", title: "Sources & Campaigns", icon: Megaphone },
  "client-journey": { eyebrow: "Person-level evidence", title: "Client Map", icon: UsersRound },
  "offers-pipeline": { eyebrow: "Commercial opportunity", title: "Offers & Pipeline", icon: FileText },
  revenue: { eyebrow: "Offer → cash", title: "Revenue", icon: Euro },
  "website-seo": { eyebrow: "Demand creation", title: "Website / SEO / Content", icon: Globe2 },
  "data-health": { eyebrow: "Trust the numbers", title: "Data Health", icon: Database },

  "leads-sales": { eyebrow: "Commercial detail", title: "Leads & Sales", icon: Activity },
  visits: { eyebrow: "Commercial detail", title: "Visits", icon: Activity },
  "sales-projects": { eyebrow: "Commercial detail", title: "Sales & Projects", icon: Activity },
  acquisition: { eyebrow: "Commercial detail", title: "Acquisition", icon: Activity },
  services: { eyebrow: "Commercial detail", title: "Services", icon: Activity },
  locations: { eyebrow: "Commercial detail", title: "Locations", icon: Activity },
  cohorts: { eyebrow: "Commercial detail", title: "Cohorts", icon: Activity },
  "sales-team": { eyebrow: "Commercial detail", title: "Sales Team", icon: Activity },
  integrations: { eyebrow: "Sources & quality", title: "Data / Integrations", icon: Database },
  settings: { eyebrow: "Workspace controls", title: "Settings", icon: Settings },
} as const;

export type SectionKey = keyof typeof sectionMeta;
