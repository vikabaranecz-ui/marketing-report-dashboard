import { CampaignAttributionDashboard } from "@/components/dashboard/campaign-attribution";
import { getMetaCampaignReportBootstrap } from "@/lib/data/meta-campaign-report";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  return <CampaignAttributionDashboard bootstrap={await getMetaCampaignReportBootstrap(params.month)} />;
}
