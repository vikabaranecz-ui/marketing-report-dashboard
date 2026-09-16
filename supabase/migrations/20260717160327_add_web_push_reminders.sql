
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 2048),
  p256dh text not null check (char_length(p256dh) between 20 and 256),
  auth_key text not null check (char_length(auth_key) between 8 and 128),
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

create policy "Users can read own push subscriptions"
on public.push_subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can delete own push subscriptions"
on public.push_subscriptions for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, delete on public.push_subscriptions to authenticated;

create table public.push_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_id text not null check (char_length(reminder_id) between 1 and 200),
  title text not null check (char_length(title) between 1 and 240),
  body text not null default '',
  target_label text not null default '',
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, reminder_id)
);

create index push_reminders_due_idx
on public.push_reminders(remind_at)
where sent_at is null;

alter table public.push_reminders enable row level security;

create policy "Users can read own push reminders"
on public.push_reminders for select to authenticated
using ((select auth.uid()) = user_id);

grant select on public.push_reminders to authenticated;

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(p_endpoint) not between 20 and 2048
     or char_length(p_p256dh) not between 20 and 256
     or char_length(p_auth_key) not between 8 and 128 then
    raise exception 'Invalid push subscription';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth_key, user_agent)
  values (v_user_id, p_endpoint, p_p256dh, p_auth_key, left(coalesce(p_user_agent, ''), 500))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

create or replace function public.sync_push_reminders(p_reminders jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_reminders) <> 'array' then
    raise exception 'Reminders must be a JSON array';
  end if;

  delete from public.push_reminders r
  where r.user_id = v_user_id
    and not exists (
      select 1
      from jsonb_array_elements(p_reminders) item
      where item->>'reminder_id' = r.reminder_id
    );

  insert into public.push_reminders(
    user_id, reminder_id, title, body, target_label, remind_at
  )
  select
    v_user_id,
    left(item->>'reminder_id', 200),
    left(item->>'title', 240),
    left(coalesce(item->>'body', ''), 1000),
    left(coalesce(item->>'target_label', ''), 500),
    (item->>'remind_at')::timestamptz
  from jsonb_array_elements(p_reminders) item
  where coalesce(item->>'reminder_id', '') <> ''
    and coalesce(item->>'title', '') <> ''
    and (item->>'remind_at') is not null
  on conflict (user_id, reminder_id) do update
  set title = excluded.title,
      body = excluded.body,
      target_label = excluded.target_label,
      sent_at = case
        when public.push_reminders.remind_at is distinct from excluded.remind_at then null
        else public.push_reminders.sent_at
      end,
      remind_at = excluded.remind_at,
      updated_at = now();
end;
$$;

revoke all on function public.sync_push_reminders(jsonb) from public, anon;
grant execute on function public.sync_push_reminders(jsonb) to authenticated;

create or replace function public.get_push_delivery_config()
returns table (
  vapid_private_key text,
  vapid_contact text,
  cron_secret text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private_key' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_contact' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret' limit 1);
$$;

revoke all on function public.get_push_delivery_config() from public, anon, authenticated;
grant execute on function public.get_push_delivery_config() to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;
;
