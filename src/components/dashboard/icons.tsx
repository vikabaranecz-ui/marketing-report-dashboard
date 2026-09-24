import { Activity, Database, FileText, Globe2, LayoutDashboard, Megaphone, Settings, UsersRound } from "lucide-react";

export const navItems = [
  { href: "/overview", label: "Home", icon: LayoutDashboard },
  { href: "/client-journey", label: "Payback", icon: UsersRound },
  { href: "/offers-pipeline", label: "Pipeline", icon: FileText },
  { href: "/campaigns", label: "Marketing", icon: Megaphone },
  { href: "/website-seo", label: "Website & SEO", icon: Globe2 },
  { href: "/data-health", label: "Data & Sync", icon: Database },
] as const;

export const sectionMeta = {
  overview: { eyebrow: "WAT Agency dashboard", title: "Marketing Overview", icon: LayoutDashboard },
  "client-journey": { eyebrow: "Acquisition cohort → later cash", title: "Customer Payback", icon: UsersRound },
  "offers-pipeline": { eyebrow: "Offers, follow-up & cash", title: "Pipeline", icon: FileText },
  campaigns: { eyebrow: "Source economics", title: "Marketing", icon: Megaphone },
  "website-seo": { eyebrow: "Demand creation", title: "Website & SEO", icon: Globe2 },
  "data-health": { eyebrow: "Automation, integrations & trust", title: "Data & Sync", icon: Database },

  funnel: { eyebrow: "Leakage & conversion", title: "Funnel detail", icon: Activity },
  revenue: { eyebrow: "Offer → cash", title: "Revenue detail", icon: Activity },
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
