import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type OverrideBody = {
  companyId?: string;
  periodKey?: string;
  scopeType?: "company" | "source" | "client";
  scopeKey?: string;
  fieldKey?: string;
  value?: unknown;
  note?: string;
};

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({})) as OverrideBody;
  if (!body.companyId || !body.periodKey || !body.scopeType || !body.scopeKey || !body.fieldKey) {
    return json({ error: "companyId, periodKey, scopeType, scopeKey and fieldKey are required." }, 400);
  }

  if (!validKey(body.periodKey) || !validKey(body.scopeKey) || !validKey(body.fieldKey)) {
    return json({ error: "Override identifiers are invalid." }, 400);
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "Authentication required." }, 401);

  const { data, error } = await supabase
    .from("reporting_overrides")
    .upsert({
      company_id: body.companyId,
      period_key: body.periodKey,
      scope_type: body.scopeType,
      scope_key: body.scopeKey,
      field_key: body.fieldKey,
      value: body.value ?? null,
      note: typeof body.note === "string" ? body.note.slice(0, 1000) : null,
      updated_by: authData.user.id,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "company_id,period_key,scope_type,scope_key,field_key",
    })
    .select("id,period_key,scope_type,scope_key,field_key,value,note,updated_at")
    .single();

  if (error) return json({ error: error.message }, 400);
  return json({ override: data });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({})) as OverrideBody;
  if (!body.companyId || !body.periodKey || !body.scopeType || !body.scopeKey || !body.fieldKey) {
    return json({ error: "Override identity is required." }, 400);
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "Authentication required." }, 401);

  const { error } = await supabase
    .from("reporting_overrides")
    .delete()
    .eq("company_id", body.companyId)
    .eq("period_key", body.periodKey)
    .eq("scope_type", body.scopeType)
    .eq("scope_key", body.scopeKey)
    .eq("field_key", body.fieldKey);

  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}

function validKey(value: string) {
  return value.length > 0 && value.length <= 200;
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
