import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IntegrationProvider } from "./types";

export async function requireIntegrationConnection(companyId: string, provider: IntegrationProvider) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication required.", status: 401 as const };

  const { data, error } = await supabase
    .from("reporting_integration_connections")
    .select("id,company_id,provider,status,configuration,error_message")
    .eq("company_id", companyId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 as const };
  if (!data) return { error: "You do not have permission to manage this company integration.", status: 403 as const };
  return { supabase, user, connection: data };
}
