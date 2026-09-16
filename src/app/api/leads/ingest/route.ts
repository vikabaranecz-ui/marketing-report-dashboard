import { NextResponse } from "next/server";
import { credentialStore } from "@/lib/integrations/credentials";
import { verifyWebsiteFormsSignature } from "@/lib/integrations/website-forms";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type LeadPayload = {
  company?: string;
  created_at?: string;
  name?: string;
  email?: string;
  phone?: string;
  service?: string;
  municipality?: string;
  postal_code?: string;
  landing_page?: string;
  referrer?: string;
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  meta_lead_id?: string;
  form_name?: string;
  form_type?: string;
  notes?: string;
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: LeadPayload;
  try { payload = JSON.parse(rawBody) as LeadPayload; }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

  const companySlug = clean(payload.company, 100);
  const idempotencyKey = clean(request.headers.get("x-idempotency-key"), 200);
  if (!companySlug || !idempotencyKey) return NextResponse.json({ error: "company and x-idempotency-key are required." }, { status: 400 });

  try {
    const supabase = createSupabaseAdminClient();
    const { data: company, error: companyError } = await supabase.from("companies").select("id").eq("slug", companySlug).eq("is_active", true).maybeSingle();
    if (companyError) throw companyError;
    if (!company) return NextResponse.json({ error: "Unknown company." }, { status: 404 });

    const { data: connection, error: connectionError } = await supabase
      .from("reporting_integration_connections")
      .select("id,status")
      .eq("company_id", company.id)
      .eq("provider", "website_forms")
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.status !== "connected") {
      return NextResponse.json(
        { error: "Lead ingestion is not configured for this company." },
        { status: 503 },
      );
    }

    const credential = await credentialStore.read(
      connection.id,
      "website_forms",
    );
    const signature = await verifyWebsiteFormsSignature({
      body: rawBody,
      headers: request.headers,
      secret: credential?.accessToken,
    });
    if (!signature.ok) {
      return NextResponse.json(
        { error: signature.error },
        { status: signature.status },
      );
    }

    const name = clean(payload.name, 200);
    if (!name || (!payload.email && !payload.phone)) return NextResponse.json({ error: "name and either email or phone are required." }, { status: 400 });

    let serviceId: string | null = null;
    const serviceName = clean(payload.service, 200);
    if (serviceName) {
      const { data: service } = await supabase.from("services").select("id").eq("company_id", company.id).ilike("name", serviceName).maybeSingle();
      serviceId = service?.id ?? null;
    }

    const row = {
      company_id: company.id,
      ingestion_key: idempotencyKey,
      created_at: validDate(payload.created_at) ?? new Date().toISOString(),
      name,
      email: clean(payload.email, 320),
      phone: clean(payload.phone, 80),
      service_id: serviceId,
      municipality: clean(payload.municipality, 160),
      postal_code: clean(payload.postal_code, 40),
      landing_page: clean(payload.landing_page, 2000),
      referrer: clean(payload.referrer, 2000),
      source: clean(payload.source, 160) ?? "website",
      utm_source: clean(payload.utm_source, 500), utm_medium: clean(payload.utm_medium, 500), utm_campaign: clean(payload.utm_campaign, 500), utm_content: clean(payload.utm_content, 500), utm_term: clean(payload.utm_term, 500),
      gclid: clean(payload.gclid, 500), fbclid: clean(payload.fbclid, 500), meta_lead_id: clean(payload.meta_lead_id, 500),
      form_name: clean(payload.form_name, 200), form_type: clean(payload.form_type, 100), notes: clean(payload.notes, 5000),
    };
    const { data: lead, error } = await supabase.from("leads").upsert(row, { onConflict: "company_id,ingestion_key" }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ accepted: true, leadId: lead.id }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lead ingestion failed.";
    return NextResponse.json({ error: message }, { status: message.includes("SUPABASE_SECRET_KEY") ? 503 : 500 });
  }
}

function clean(value: unknown, maxLength: number) { return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null; }
function validDate(value: unknown) { if (typeof value !== "string") return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
