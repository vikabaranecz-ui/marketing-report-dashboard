
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'send-push-reminders-every-minute';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end
$$;

select cron.schedule(
  'send-push-reminders-every-minute',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://xyvpresvfubmmfweyasf.supabase.co/functions/v1/send-push-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'push_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $cron$
);
;
