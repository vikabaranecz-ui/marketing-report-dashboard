import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardBootstrap } from "@/lib/data/repository";
export default async function Page() { return <DashboardShell bootstrap={await getDashboardBootstrap()} section="leads-sales"/>; }
