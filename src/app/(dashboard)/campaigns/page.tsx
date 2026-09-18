import { CampaignAttributionDashboard } from "@/components/dashboard/campaign-attribution";
import { getMetaCampaignReportBootstrap } from "@/lib/data/meta-campaign-report";

export default async function Page() {
  return <CampaignAttributionDashboard bootstrap={await getMetaCampaignReportBootstrap()} />;
}
