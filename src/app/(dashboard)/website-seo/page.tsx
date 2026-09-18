import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardBootstrap } from "@/lib/data/repository";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  return <DashboardShell bootstrap={await getDashboardBootstrap(params.month)} section="website-seo"/>;
}
