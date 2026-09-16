import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IntegrationProvider } from "./types";

export async function requireIntegrationConnection(companyId: string, provider: IntegrationProvider) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (authError || !claims?.sub) {
    return { error: "Authentication required. Please sign in again.", status: 401 as const };
  }

  const { data, error } = await supabase
    .from("reporting_integration_connections")
    .select("id,company_id,provider,status,configuration,error_message")
    .eq("company_id", companyId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 as const };
  if (!data) return { error: "You do not have permission to manage this company integration.", status: 403 as const };
  return { supabase, user: { id: claims.sub }, connection: data };
}
