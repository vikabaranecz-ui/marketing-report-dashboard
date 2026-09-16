alter table reporting_private.integration_secrets
  add column if not exists vault_secret_id uuid;

alter table reporting_private.integration_secrets
  alter column encrypted_credentials drop not null;

alter table reporting_private.integration_secrets
  enable row level security;

create unique index if not exists integration_secrets_vault_secret_id_idx
  on reporting_private.integration_secrets (vault_secret_id)
  where vault_secret_id is not null;

revoke all on schema reporting_private from public, anon, authenticated;
revoke all on table reporting_private.integration_secrets from public, anon, authenticated;

create or replace function public.reporting_put_integration_secret(
  p_connection_id uuid,
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
  if not exists (
    select 1
    from public.reporting_integration_connections
    where id = p_connection_id
  ) then
    raise exception 'Unknown integration connection';
  end if;

  select vault_secret_id
  into v_secret_id
  from reporting_private.integration_secrets
  where integration_connection_id = p_connection_id;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_secret,
      'reporting-integration-' || p_connection_id::text,
      'WAT Reporting OAuth credential'
    );

    insert into reporting_private.integration_secrets (
      integration_connection_id,
      vault_secret_id,
      updated_at
    )
    values (
      p_connection_id,
      v_secret_id,
      now()
    )
    on conflict (integration_connection_id)
    do update set
      vault_secret_id = excluded.vault_secret_id,
      updated_at = now();
  else
    perform vault.update_secret(v_secret_id, p_secret);

    update reporting_private.integration_secrets
    set updated_at = now()
    where integration_connection_id = p_connection_id;
  end if;
end;
$$;

create or replace function public.reporting_get_integration_secret(
  p_connection_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select ds.decrypted_secret
  into v_secret
  from reporting_private.integration_secrets s
  join vault.decrypted_secrets ds
    on ds.id = s.vault_secret_id
  where s.integration_connection_id = p_connection_id;

  return v_secret;
end;
$$;

create or replace function public.reporting_delete_integration_secret(
  p_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  delete from reporting_private.integration_secrets
  where integration_connection_id = p_connection_id
  returning vault_secret_id into v_secret_id;

  if v_secret_id is not null then
    delete from vault.secrets
    where id = v_secret_id;
  end if;
end;
$$;

revoke all on function public.reporting_put_integration_secret(uuid, text)
  from public, anon, authenticated;

revoke all on function public.reporting_get_integration_secret(uuid)
  from public, anon, authenticated;

revoke all on function public.reporting_delete_integration_secret(uuid)
  from public, anon, authenticated;

grant execute on function public.reporting_put_integration_secret(uuid, text)
  to service_role;

grant execute on function public.reporting_get_integration_secret(uuid)
  to service_role;

grant execute on function public.reporting_delete_integration_secret(uuid)
  to service_role;
