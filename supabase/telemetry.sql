-- Play data store for the review pipeline (api/telemetry.js writes, the ops repo's nightly pull reads).
-- Event shapes: packages/client/src/save.ts TelemetryEvent (contract in the review docs). Apply once to
-- the Supabase project; it is safe to re-run.

create table if not exists public.telemetry_events (
  id          bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  ts          timestamptz not null,
  kind        text not null,
  install     text not null,
  session     text not null,
  build       text,
  engine      text,
  content     text,
  np          text,
  level_id    text,
  attempt     integer,
  -- the whole event as the game sent it; the nightly pull hands these to the review tools unchanged
  event       jsonb not null
);

create index if not exists telemetry_events_received_idx on public.telemetry_events (received_at);
create index if not exists telemetry_events_level_idx on public.telemetry_events (level_id, kind);

-- No policies: only the server-side secret key (which bypasses RLS) can read or write. The anon and
-- publishable keys see nothing.
alter table public.telemetry_events enable row level security;

-- Per level and day: plays, outcomes, ratings and the play-shape and frame-time medians. The review
-- tools aggregate the raw events themselves; this view is for looking at the data in Supabase.
create or replace view public.telemetry_level_daily
with (security_invoker = true) as
select
  date_trunc('day', received_at)::date                                        as day,
  level_id,
  count(*) filter (where kind = 'level_start')                                as starts,
  count(*) filter (where kind = 'level_end' and event->>'outcome' = 'win')   as wins,
  count(*) filter (where kind = 'level_end' and event->>'outcome' = 'lose')  as losses,
  count(*) filter (where kind = 'level_end' and event->>'outcome' in ('quit', 'skip')) as quits,
  count(*) filter (where kind = 'rating' and event->>'thumb' = 'up')         as thumbs_up,
  count(*) filter (where kind = 'rating' and event->>'thumb' = 'down')       as thumbs_down,
  count(distinct install)                                                     as players,
  count(distinct install) filter (where np = 'new')                           as new_players,
  percentile_cont(0.5) within group (order by (event->>'longestStillS')::numeric) filter (where kind = 'play_shape') as median_longest_still_s,
  percentile_cont(0.5) within group (order by (event->>'rewardGapMaxS')::numeric) filter (where kind = 'play_shape') as median_reward_gap_s,
  percentile_cont(0.5) within group (order by (event->>'p95Ms')::numeric)         filter (where kind = 'perf')       as median_p95_frame_ms
from public.telemetry_events
where level_id is not null
group by 1, 2;

-- Raw events are kept 90 days; the nightly review keeps its own aggregates for good.
create or replace function public.telemetry_prune() returns integer
language sql security definer set search_path = public as $$
  with gone as (delete from public.telemetry_events where received_at < now() - interval '90 days' returning 1)
  select count(*)::integer from gone;
$$;
revoke all on function public.telemetry_prune() from public, anon, authenticated;

-- Daily prune at 03:30 UTC when pg_cron is available (it is on Supabase; enable it under Database → Extensions if this notice appears).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'telemetry-prune';
  perform cron.schedule('telemetry-prune', '30 3 * * *', 'select public.telemetry_prune()');
exception when others then
  raise notice 'pg_cron not available (%); run select public.telemetry_prune() by hand or enable the extension', sqlerrm;
end $$;
