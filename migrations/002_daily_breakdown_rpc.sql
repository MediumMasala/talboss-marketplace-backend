-- Aggregation RPC so routes don't hit the 1000-row default fetch limit.
-- Used by /api/summary and /api/aggregates.

create or replace function daily_breakdown(start_date date, end_date date)
returns table (
  joined_at date,
  total bigint,
  marketplace bigint,
  tier1_supreme bigint,
  tal_users bigint,
  round1 bigint
)
language sql
stable
as $$
  select
    joined_at,
    count(*) as total,
    count(*) filter (where is_marketplace) as marketplace,
    count(*) filter (where is_marketplace and tier in ('tier1','supreme')) as tier1_supreme,
    count(*) filter (where source_table in ('tal_users','both')) as tal_users,
    count(*) filter (where source_table in ('round1_god_table','both')) as round1
  from candidates_daily
  where joined_at between start_date and end_date
  group by joined_at
  order by joined_at;
$$;
