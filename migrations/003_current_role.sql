-- Adds the classifier-extracted current_role column.
-- Backfill is handled by re-running cron after deploy.

alter table candidates_daily
  add column if not exists current_role text;

create index if not exists candidates_daily_current_role_idx
  on candidates_daily (current_role);
