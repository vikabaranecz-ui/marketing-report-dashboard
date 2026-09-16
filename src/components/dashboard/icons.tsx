import { Activity, BarChart3, Building2, Cable, Crosshair, Globe2, LayoutDashboard, MapPin, Megaphone, Settings, UsersRound, Wrench } from "lucide-react";

export const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/acquisition", label: "Acquisition", icon: Crosshair },
  { href: "/leads-sales", label: "Leads & Sales", icon: UsersRound },
  { href: "/services", label: "Services", icon: Wrench },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/website-seo", label: "Website & SEO", icon: Globe2 },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/integrations", label: "Data / Integrations", icon: Cable },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const sectionMeta = {
  overview: { eyebrow: "Executive view", title: "Marketing performance", icon: BarChart3 },
  acquisition: { eyebrow: "Channel economics", title: "Acquisition", icon: Crosshair },
  "leads-sales": { eyebrow: "CRM-confirmed outcomes", title: "Leads & Sales", icon: UsersRound },
  services: { eyebrow: "Commercial outcomes", title: "Services", icon: Wrench },
  campaigns: { eyebrow: "Paid media detail", title: "Campaigns", icon: Megaphone },
  "website-seo": { eyebrow: "Owned demand", title: "Website & SEO", icon: Globe2 },
  locations: { eyebrow: "Geographic performance", title: "Locations", icon: MapPin },
  integrations: { eyebrow: "Sources & quality", title: "Data / Integrations", icon: Activity },
  settings: { eyebrow: "Workspace controls", title: "Settings", icon: Building2 },
} as const;

export type SectionKey = keyof typeof sectionMeta;
