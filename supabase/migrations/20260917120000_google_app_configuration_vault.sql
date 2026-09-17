create table if not exists reporting_private.integration_app_secrets (
  integration_key text primary key,
  vault_secret_id uuid not null unique,
  updated_at timestamptz not null default now(),
  constraint integration_app_secrets_google_only
    check (integration_key = 'google')
);

alter table reporting_private.integration_app_secrets
  enable row level security;

revoke all on schema reporting_private from public, anon, authenticated;
revoke all on table reporting_private.integration_app_secrets
  from public, anon, authenticated;

create or replace function public.reporting_put_app_integration_secret(
  p_integration_key text,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if p_integration_key <> 'google' then
    raise exception 'Unsupported application integration key';
  end if;

  if p_secret is null or length(p_secret) = 0 then
    raise exception 'Application integration secret cannot be empty';
  end if;

  select vault_secret_id
  into v_secret_id
  from reporting_private.integration_app_secrets
  where integration_key = p_integration_key;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret,
      'reporting-app-integration-' || p_integration_key,
      'WAT Reporting application integration configuration'
    );

    insert into reporting_private.integration_app_secrets (
      integration_key,
      vault_secret_id,
      updated_at
    )
    values (
      p_integration_key,
      v_secret_id,
      now()
    );
  else
    perform vault.update_secret(v_secret_id, p_secret);

    update reporting_private.integration_app_secrets
    set updated_at = now()
    where integration_key = p_integration_key;
  end if;
end;
$$;

create or replace function public.reporting_get_app_integration_secret(
  p_integration_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if p_integration_key <> 'google' then
    raise exception 'Unsupported application integration key';
  end if;

  select decrypted.decrypted_secret
  into v_secret
  from reporting_private.integration_app_secrets stored
  join vault.decrypted_secrets decrypted
    on decrypted.id = stored.vault_secret_id
  where stored.integration_key = p_integration_key;

  return v_secret;
end;
$$;

revoke all on function public.reporting_put_app_integration_secret(text, text)
  from public, anon, authenticated;
revoke all on function public.reporting_get_app_integration_secret(text)
  from public, anon, authenticated;

grant execute on function public.reporting_put_app_integration_secret(text, text)
  to service_role;
grant execute on function public.reporting_get_app_integration_secret(text)
  to service_role;

comment on table reporting_private.integration_app_secrets is
  'Application-level integration secrets. Values are stored encrypted in Supabase Vault and are never company configuration.';
