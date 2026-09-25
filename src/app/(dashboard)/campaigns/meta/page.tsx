import { CampaignAttributionDashboard } from "@/components/dashboard/campaign-attribution";
import { getMetaCampaignReportBootstrap } from "@/lib/data/meta-campaign-report";
import { getSourceClientValues } from "@/lib/data/source-client-values";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string; company?: string }> }) {
  const params = await searchParams;
  const bootstrap = await getMetaCampaignReportBootstrap(params.month, params.company);
  const sourceClients = await getSourceClientValues(bootstrap.selectedCompanyId, bootstrap.selectedMonth);
  return <CampaignAttributionDashboard bootstrap={bootstrap} sourceClients={sourceClients} />;
}
