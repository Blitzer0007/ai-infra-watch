-- Disposable PostgreSQL integration assertions for the Telegram delivery outbox migration.
-- This file is executed only against the ephemeral PostgreSQL service in CI.
DO $$
DECLARE
  first_claim boolean;
  duplicate_claim boolean;
  finished boolean;
  current_status text;
  current_message_id bigint;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='reentry_telegram_deliveries') THEN
    RAISE EXCEPTION 'RLS must be enabled on the delivery ledger';
  END IF;

  IF has_table_privilege('anon','public.reentry_telegram_deliveries','SELECT')
     OR has_table_privilege('authenticated','public.reentry_telegram_deliveries','SELECT') THEN
    RAISE EXCEPTION 'anon/authenticated must not have direct SELECT on the delivery ledger';
  END IF;
  IF NOT has_table_privilege('service_role','public.reentry_telegram_deliveries','SELECT') THEN
    RAISE EXCEPTION 'service_role must retain server-side ledger access';
  END IF;

  IF has_function_privilege('anon','public.claim_reentry_telegram_delivery(text,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.claim_reentry_telegram_delivery(text,text,text)','EXECUTE')
     OR has_function_privilege('anon','public.finish_reentry_telegram_delivery(text,text,bigint,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.finish_reentry_telegram_delivery(text,text,bigint,text)','EXECUTE') THEN
    RAISE EXCEPTION 'anon/authenticated must not be able to execute delivery ledger RPCs';
  END IF;
  IF NOT has_function_privilege('service_role','public.claim_reentry_telegram_delivery(text,text,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.finish_reentry_telegram_delivery(text,text,bigint,text)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role must be able to execute delivery ledger RPCs';
  END IF;

  SELECT public.claim_reentry_telegram_delivery(
    'ci-accepted-episode','NVDA','ci-test-chat'
  ) INTO first_claim;
  IF first_claim IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'first claim must succeed';
  END IF;

  SELECT public.claim_reentry_telegram_delivery(
    'ci-accepted-episode','NVDA','ci-test-chat'
  ) INTO duplicate_claim;
  IF duplicate_claim IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'duplicate claim must be suppressed';
  END IF;

  SELECT public.finish_reentry_telegram_delivery(
    'ci-accepted-episode','accepted',9876,NULL
  ) INTO finished;
  IF finished IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'accepted finalization must update a sending row';
  END IF;
  SELECT status, telegram_message_id INTO current_status, current_message_id
    FROM public.reentry_telegram_deliveries WHERE delivery_key='ci-accepted-episode';
  IF current_status <> 'accepted' OR current_message_id <> 9876 THEN
    RAISE EXCEPTION 'accepted state and Telegram message ID must be persisted';
  END IF;

  SELECT public.claim_reentry_telegram_delivery(
    'ci-accepted-episode','NVDA','ci-test-chat'
  ) INTO duplicate_claim;
  IF duplicate_claim IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'accepted delivery must not be reclaimed or sent again';
  END IF;

  -- A definitive Telegram rejection means the provider did not accept the message.
  -- It may be retried by the next scheduled scan using the same idempotency key.
  SELECT public.claim_reentry_telegram_delivery(
    'ci-rejected-episode','AMD','ci-test-chat'
  ) INTO first_claim;
  IF first_claim IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'first rejected-episode claim must succeed';
  END IF;
  SELECT public.finish_reentry_telegram_delivery(
    'ci-rejected-episode','rejected',NULL,'simulated definitive Telegram rejection'
  ) INTO finished;
  IF finished IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'rejected finalization must update a sending row';
  END IF;
  SELECT public.claim_reentry_telegram_delivery(
    'ci-rejected-episode','AMD','ci-test-chat'
  ) INTO first_claim;
  IF first_claim IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'definitively rejected delivery must be claimable for retry';
  END IF;
  SELECT status, telegram_message_id INTO current_status, current_message_id
    FROM public.reentry_telegram_deliveries WHERE delivery_key='ci-rejected-episode';
  IF current_status <> 'sending' OR current_message_id IS NOT NULL THEN
    RAISE EXCEPTION 'retry must atomically reset rejected claim to sending without a message ID';
  END IF;
  SELECT public.claim_reentry_telegram_delivery(
    'ci-rejected-episode','AMD','ci-test-chat'
  ) INTO duplicate_claim;
  IF duplicate_claim IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'a retried sending claim must still suppress concurrent duplicate attempts';
  END IF;

  SELECT public.claim_reentry_telegram_delivery(
    'ci-uncertain-episode','MU','ci-test-chat'
  ) INTO first_claim;
  IF first_claim IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'second independent episode claim must succeed';
  END IF;
  SELECT public.finish_reentry_telegram_delivery(
    'ci-uncertain-episode','uncertain',4321,'simulated lost acknowledgement'
  ) INTO finished;
  IF finished IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'uncertain finalization must update a sending row';
  END IF;
  SELECT status, telegram_message_id INTO current_status, current_message_id
    FROM public.reentry_telegram_deliveries WHERE delivery_key='ci-uncertain-episode';
  IF current_status <> 'uncertain' OR current_message_id <> 4321 THEN
    RAISE EXCEPTION 'uncertain state should retain a known Telegram message ID';
  END IF;
  SELECT public.claim_reentry_telegram_delivery(
    'ci-uncertain-episode','MU','ci-test-chat'
  ) INTO duplicate_claim;
  IF duplicate_claim IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'uncertain delivery must never be automatically reclaimed';
  END IF;

  RAISE NOTICE 'Telegram delivery outbox migration contract assertions passed';
END;
$$;
