import "server-only";

export type WebsiteLeadInput = {
  company: string;
  created_at?: string;
  name: string;
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
