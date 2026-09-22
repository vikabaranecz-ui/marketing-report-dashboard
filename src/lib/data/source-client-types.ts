export type SourceClientValue = {
  id: string;
  name: string;
  source: string;
  campaign: string | null;
  clientSince: string | null;
  projectValue: number | null;
  invoiced: number;
  paid: number;
  status: string;
  attribution: "CRM matched" | "Manual source";
};
