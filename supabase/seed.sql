-- Clearly synthetic local data. Never use this file for production customer records.
insert into public.organizations (id, name) values
  ('00000000-0000-4000-8000-000000000001', 'WAT Agency');

insert into public.companies (id, organization_id, name, slug) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'ISOPROTECH', 'isoprotech'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'RENO RANGERS', 'reno-rangers');

insert into public.services (company_id, name) values
  ('00000000-0000-4000-8000-000000000101', 'Dakrenovatie'),
  ('00000000-0000-4000-8000-000000000101', 'Dakisolatie'),
  ('00000000-0000-4000-8000-000000000101', 'Gevelisolatie'),
  ('00000000-0000-4000-8000-000000000101', 'Gevelrenovatie'),
  ('00000000-0000-4000-8000-000000000101', 'Dakkapel'),
  ('00000000-0000-4000-8000-000000000101', 'Asbest'),
  ('00000000-0000-4000-8000-000000000101', 'Other'),
  ('00000000-0000-4000-8000-000000000102', 'Badkamerrenovatie'),
  ('00000000-0000-4000-8000-000000000102', 'Totaalrenovatie'),
  ('00000000-0000-4000-8000-000000000102', 'Interieurafwerking'),
  ('00000000-0000-4000-8000-000000000102', 'Gyproc / pleisterwerken'),
  ('00000000-0000-4000-8000-000000000102', 'Vloeren'),
  ('00000000-0000-4000-8000-000000000102', 'Schilderwerken'),
  ('00000000-0000-4000-8000-000000000102', 'Tegelwerken'),
  ('00000000-0000-4000-8000-000000000102', 'Other');

insert into public.marketing_channels (organization_id, name, channel_type, is_paid) values
  ('00000000-0000-4000-8000-000000000001', 'Meta Ads', 'paid_social', true),
  ('00000000-0000-4000-8000-000000000001', 'Google Ads', 'paid_search', true),
  ('00000000-0000-4000-8000-000000000001', 'Google Organic', 'organic_search', false),
  ('00000000-0000-4000-8000-000000000001', 'Google Business Profile', 'local_organic', false),
  ('00000000-0000-4000-8000-000000000001', 'Instagram / Facebook Organic', 'organic_social', false),
  ('00000000-0000-4000-8000-000000000001', 'Referral', 'referral', false),
  ('00000000-0000-4000-8000-000000000001', 'Direct', 'direct', false),
  ('00000000-0000-4000-8000-000000000001', 'Other', 'other', false);

insert into public.reporting_integration_connections (company_id, provider, status) values
  ('00000000-0000-4000-8000-000000000101', 'meta', 'not_connected'),
  ('00000000-0000-4000-8000-000000000101', 'google_ads', 'not_connected'),
  ('00000000-0000-4000-8000-000000000101', 'ga4', 'not_connected'),
  ('00000000-0000-4000-8000-000000000101', 'search_console', 'not_connected'),
  ('00000000-0000-4000-8000-000000000101', 'google_business', 'not_connected'),
  ('00000000-0000-4000-8000-000000000101', 'monday', 'not_connected'),
  ('00000000-0000-4000-8000-000000000101', 'website_forms', 'not_connected');
