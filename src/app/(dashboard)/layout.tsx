import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (hasSupabaseConfig()) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/sign-in");
  }
  return children;
}
