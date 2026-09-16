
drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can read own push reminders" on public.push_reminders;

revoke all on public.push_subscriptions from authenticated, anon;
revoke all on public.push_reminders from authenticated, anon;

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
  if v_user_id is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Permanent authentication required';
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

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Permanent authentication required';
  end if;
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = v_user_id;
end;
$$;

revoke all on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.unregister_push_subscription(text) to authenticated;

create or replace function public.sync_push_reminders(p_reminders jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Permanent authentication required';
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
;
