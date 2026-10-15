-- Durable, server-only Telegram delivery ledger for re-entry candidate notifications.
-- External Telegram send and PostgreSQL cannot share a transaction. "sending"/"uncertain"
-- rows are deliberately never auto-reclaimed, preventing duplicate sends after ambiguous outcomes.
create table if not exists public.reentry_telegram_deliveries (
  id bigint generated always as identity primary key,
  delivery_key text not null unique,
  symbol text not null,
  status text not null check (status in ('sending', 'accepted', 'rejected', 'uncertain')),
  telegram_message_id bigint,
  chat_id text not null,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reentry_telegram_deliveries_accepted_has_message_id
    check (status <> 'accepted' or telegram_message_id is not null)
);

create index if not exists reentry_telegram_deliveries_symbol_created_idx
  on public.reentry_telegram_deliveries (symbol, created_at desc);

alter table public.reentry_telegram_deliveries enable row level security;
revoke all on public.reentry_telegram_deliveries from anon, authenticated;
grant all on public.reentry_telegram_deliveries to service_role;

create or replace function public.claim_reentry_telegram_delivery(
  p_delivery_key text,
  p_symbol text,
  p_chat_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if coalesce(trim(p_delivery_key), '') = '' or
     coalesce(trim(p_symbol), '') = '' or
     coalesce(trim(p_chat_id), '') = '' then
    raise exception 'delivery key, symbol, and chat id are required';
  end if;

  insert into public.reentry_telegram_deliveries
    (delivery_key, symbol, status, chat_id)
  values (p_delivery_key, upper(p_symbol), 'sending', p_chat_id)
  on conflict (delivery_key) do update
    set symbol = excluded.symbol,
        status = 'sending',
        telegram_message_id = null,
        chat_id = excluded.chat_id,
        claimed_at = now(),
        completed_at = null,
        last_error = null,
        updated_at = now()
    -- A confirmed Telegram rejection means no message was accepted, so it is safe to retry.
    -- Accepted, sending, and uncertain states are never automatically reclaimed.
    where public.reentry_telegram_deliveries.status = 'rejected';

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function public.finish_reentry_telegram_delivery(
  p_delivery_key text,
  p_status text,
  p_message_id bigint default null,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('accepted', 'rejected', 'uncertain') then
    raise exception 'invalid terminal delivery status';
  end if;
  if p_status = 'accepted' and (p_message_id is null or p_message_id <= 0) then
    raise exception 'accepted delivery requires a valid Telegram message id';
  end if;

  update public.reentry_telegram_deliveries
  set status = p_status,
      telegram_message_id = case when p_status in ('accepted', 'uncertain') then p_message_id else null end,
      last_error = left(p_error, 1000),
      completed_at = now(),
      updated_at = now()
  where delivery_key = p_delivery_key and status = 'sending';

  return found;
end;
$$;

revoke all on function public.claim_reentry_telegram_delivery(text, text, text) from public, anon, authenticated;
revoke all on function public.finish_reentry_telegram_delivery(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.claim_reentry_telegram_delivery(text, text, text) to service_role;
grant execute on function public.finish_reentry_telegram_delivery(text, text, bigint, text) to service_role;
