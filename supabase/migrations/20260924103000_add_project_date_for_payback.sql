alter table public.projects
  add column if not exists project_date date null;

comment on column public.projects.project_date is
  'Original ROBAWS project record date. Kept separate from won_at/accepted-offer timing for customer payback reporting.';
