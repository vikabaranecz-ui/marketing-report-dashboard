do $$
declare
  job record;
begin
  for job in select jobid from cron.job where jobname in ('reporting-operational-sync','reporting-marketing-sync')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule(
  'reporting-operational-sync',
  '7 * * * *',
  $$
    select net.http_post(
      url := 'https://marketing-report-dashboard-nine.vercel.app/api/automation/sync?scope=operational',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-automation-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='reporting_automation_secret' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 240000
    );
  $$
);

select cron.schedule(
  'reporting-marketing-sync',
  '22 */3 * * *',
  $$
    select net.http_post(
      url := 'https://marketing-report-dashboard-nine.vercel.app/api/automation/sync?scope=marketing',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-automation-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='reporting_automation_secret' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 240000
    );
  $$
);
