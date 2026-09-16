import { NextResponse } from "next/server";
import { requireIntegrationConnection } from "@/lib/integrations/access";
import { parseProvider } from "@/lib/integrations/catalog";
import { verifyOAuthState } from "@/lib/integrations/oauth-state";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = parseProvider((await params).provider);
  if (!provider) return NextResponse.json({ error: "Unknown integration provider." }, { status: 404 });
  const url = new URL(request.url);
  const stateValue = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!stateValue || !code) return NextResponse.redirect(new URL("/integrations?integration_error=Authorization%20was%20cancelled%20or%20incomplete.", url.origin));

  try {
    const state = verifyOAuthState(stateValue);
    if (state.provider !== provider) throw new Error("Provider mismatch in OAuth state.");
    const access = await requireIntegrationConnection(state.companyId, provider);
    if ("error" in access || access.user.id !== state.userId) throw new Error("The authorization session is no longer valid.");

    // Deliberately stop before exchanging the code. The exchange returns provider
    // tokens, and persistence remains disabled until the private token store is reviewed.
    await access.supabase.from("reporting_integration_connections").update({ status: "not_connected", error_message: "Authorization returned successfully, but token exchange is disabled pending secure storage review.", updated_at: new Date().toISOString() }).eq("id", access.connection.id);
    return NextResponse.redirect(new URL("/integrations?integration_error=Token%20exchange%20is%20disabled%20pending%20secure%20storage%20review.", url.origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid OAuth callback.";
    return NextResponse.redirect(new URL(`/integrations?integration_error=${encodeURIComponent(message)}`, url.origin));
  }
}
