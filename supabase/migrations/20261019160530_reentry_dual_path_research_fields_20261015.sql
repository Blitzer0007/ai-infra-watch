-- Add explicit ownership and dual-path thresholds to re-entry monitoring.
-- Existing rows predate ownership tracking and remain interpreted as sold-stock rules.
alter table public.reentry_watchlist
  add column if not exists ownership_status text not null default 'sold'
    check (ownership_status in ('holding', 'sold')),
  add column if not exists planned_exit_price numeric null
    check (planned_exit_price is null or planned_exit_price > 0),
  add column if not exists upper_review_price numeric null
    check (upper_review_price is null or upper_review_price > 0);

comment on column public.reentry_watchlist.ownership_status is
  'holding rules monitor a planned exit-review threshold; sold rules monitor re-entry. Neither creates broker orders.';
comment on column public.reentry_watchlist.planned_exit_price is
  'Optional price threshold that prompts an exit review while the user still holds the security; never an automatic sell.';
comment on column public.reentry_watchlist.upper_review_price is
  'Optional upper price threshold that prompts an evidence review after a sale; never an automatic buy.';
