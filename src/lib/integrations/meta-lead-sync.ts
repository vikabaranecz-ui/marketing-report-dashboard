import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  crmLeadAttributionUpdate,
  entityMapping,
  matchMetaLead,
  normalizeMetaEmail,
  normalizeMetaPhone,
  type MetaLeadRecord,
} from "./meta/lead-attribution-core";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type CrmLeadRow = {
  id: string;
  email: string | null;
  phone: string | null;
  meta_lead_id: string | null;
};

export type MetaLeadSyncResult = {
  imported: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  earliest: string | null;
  latest: string | null;
  matchRate: number;
};

export async function syncMetaLeadAttribution(
  admin: Admin,
  companyId: string,
  records: MetaLeadRecord[],
  campaignIds: Map<string, string>,
  adGroupIds: Map<string, string>,
  adIds: Map<string, string>,
): Promise<MetaLeadSyncResult> {
  const crmResult = await admin
    .from("leads")
    .select("id,email,phone,meta_lead_id")
    .eq("company_id", companyId);
  if (crmResult.error) throw new Error(`Unable to load CRM leads for Meta attribution: ${crmResult.error.message}`);

  const crmLeads = ((crmResult.data ?? []) as CrmLeadRow[]).map(row => ({
    id: row.id,
    email: row.email,
    phone: row.phone,
    metaLeadId: row.meta_lead_id,
  }));
  const now = new Date().toISOString();
  const attributionRows: Record<string, unknown>[] = [];
  const leadUpdates: Array<{ leadId: string; values: Record<string, unknown> }> = [];

  for (const record of records) {
    const match = matchMetaLead(record, crmLeads);
    const mapping = entityMapping(record, campaignIds, adGroupIds, adIds);
    attributionRows.push({
      company_id: companyId,
      meta_lead_id: record.id,
      created_time: record.createdTime,
      page_id: record.pageId,
      form_id: record.formId,
      campaign_external_id: record.campaignExternalId,
      adset_external_id: record.adsetExternalId,
      ad_external_id: record.adExternalId,
      campaign_id: mapping.campaignId,
      ad_group_id: mapping.adGroupId,
      ad_id: mapping.adId,
      email_normalized: normalizeMetaEmail(record.email) || null,
      phone_normalized: normalizeMetaPhone(record.phone) || null,
      matched_lead_id: match.leadId,
      match_method: match.method,
      match_status: match.status,
      matched_at: match.status === "MATCHED" ? now : null,
      updated_at: now,
    });

    if (match.leadId) {
      leadUpdates.push({
        leadId: match.leadId,
        values: crmLeadAttributionUpdate(record.id, mapping),
      });
      const claimed = crmLeads.find(lead => lead.id === match.leadId);
      if (claimed) claimed.metaLeadId = record.id;
    }
  }

  for (let index = 0; index < attributionRows.length; index += 500) {
    const result = await admin
      .from("meta_lead_attribution")
      .upsert(attributionRows.slice(index, index + 500), {
        onConflict: "company_id,meta_lead_id",
      });
    if (result.error) throw new Error(`Unable to store Meta lead attribution: ${result.error.message}`);
  }

  for (let index = 0; index < leadUpdates.length; index += 25) {
    await Promise.all(leadUpdates.slice(index, index + 25).map(async update => {
      const result = await admin
        .from("leads")
        .update(update.values)
        .eq("id", update.leadId)
        .eq("company_id", companyId);
      if (result.error) throw new Error(`Unable to update attributed CRM lead: ${result.error.message}`);
    }));
  }

  const matched = attributionRows.filter(row => row.match_status === "MATCHED").length;
  const unmatched = attributionRows.filter(row => row.match_status === "UNMATCHED").length;
  const ambiguous = attributionRows.filter(row => row.match_status === "AMBIGUOUS").length;
  const dates = records.map(record => record.createdTime).filter(Boolean).sort();
  return {
    imported: records.length,
    matched,
    unmatched,
    ambiguous,
    earliest: dates[0] ?? null,
    latest: dates.at(-1) ?? null,
    matchRate: records.length ? matched / records.length : 0,
  };
}
