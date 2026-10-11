\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
create temp table results (name text, ok boolean);
grant all on results to public;
create function pg_temp.expect_fail(name text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; insert into results values (name, false); raise notice 'FAIL  %  (statement unexpectedly succeeded)', name;
  exception when others then insert into results values (name, true); raise notice 'PASS  %', name; end;
end $$;
create function pg_temp.expect_eq(name text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is not distinct from want then insert into results values (name, true); raise notice 'PASS  %', name;
  else insert into results values (name, false); raise notice 'FAIL  %  (got %, wanted %)', name, got, want; end if;
end $$;

-- users: ann free, ben free, cat free, fay founding member, gus complimentary, hal free (a second account for isolation)
insert into auth.users (id, email) values
 ('a0000000-0000-0000-0000-00000000000a','ann@example.test'), ('b0000000-0000-0000-0000-00000000000b','ben@example.test'),
 ('c0000000-0000-0000-0000-00000000000c','cat@example.test'), ('f0000000-0000-0000-0000-00000000000f','fay@example.test'),
 ('90000000-0000-0000-0000-000000000009','gus@example.test'), ('a1000000-0000-0000-0000-0000000000a1','hal@example.test');
update public.entitlements set status='founding_member', subscription_start=now()-interval '1 day' where user_id='f0000000-0000-0000-0000-00000000000f';
update public.entitlements set status='complimentary', subscription_start=now()-interval '1 day', subscription_end=now()+interval '10 days', granted_by='c0000000-0000-0000-0000-00000000000c', grant_reason='gift' where user_id='90000000-0000-0000-0000-000000000009';

select pg_temp.expect_eq('settings price is still 499,900 kobo at the start', (select (value->>'amount_kobo')::bigint from public.app_settings where key='premium_price'), 499900::bigint);

-- ===== nobody but the service role can call the payment functions or write payments =====
select pg_temp.expect_eq('authenticated cannot execute apply_paystack_charge', has_function_privilege('authenticated', 'public.apply_paystack_charge(text,text,bigint,text,timestamptz,text,text,text)', 'execute'), false);
select pg_temp.expect_eq('anon cannot execute apply_paystack_charge', has_function_privilege('anon', 'public.apply_paystack_charge(text,text,bigint,text,timestamptz,text,text,text)', 'execute'), false);
select pg_temp.expect_eq('authenticated cannot execute create_checkout_payment', has_function_privilege('authenticated', 'public.create_checkout_payment(uuid,text,bigint,text)', 'execute'), false);
select pg_temp.expect_eq('authenticated cannot execute the subscription event function', has_function_privilege('authenticated', 'public.apply_paystack_subscription_event(text,text,text,text)', 'execute'), false);
select pg_temp.expect_eq('authenticated cannot execute claim_webhook_event', has_function_privilege('authenticated', 'public.claim_webhook_event(text,text)', 'execute'), false);
select pg_temp.expect_eq('service_role can execute apply_paystack_charge', has_function_privilege('service_role', 'public.apply_paystack_charge(text,text,bigint,text,timestamptz,text,text,text)', 'execute'), true);
select pg_temp.expect_eq('public (PUBLIC pseudo-role) cannot execute apply_paystack_charge', (select count(*)::int from pg_proc p where p.proname='apply_paystack_charge' and has_function_privilege('public', p.oid, 'execute')), 0);

-- ===== checkout + first charge =====
set role service_role;
select public.create_checkout_payment('a0000000-0000-0000-0000-00000000000a', 'UC-ann-0001-aaaa', 499900, 'PLN_test');
select pg_temp.expect_eq('checkout creates a pending payment for that user', (select status from public.payments where reference='UC-ann-0001-aaaa'), 'pending');
select pg_temp.expect_fail('a checkout for an unknown user is refused', $$select public.create_checkout_payment('00000000-0000-0000-0000-000000000bad', 'UC-bad-0000-0001', 499900, 'PLN_test')$$);
select pg_temp.expect_fail('a duplicate checkout reference is refused', $$select public.create_checkout_payment('a0000000-0000-0000-0000-00000000000a', 'UC-ann-0001-aaaa', 499900, 'PLN_test')$$);
select pg_temp.expect_eq('first charge is granted', public.apply_paystack_charge('UC-ann-0001-aaaa', 'tx1001', 499900, 'NGN', '2026-10-01 09:00:00+00', 'CUS_ann', 'SUB_ann1', 'PLN_test'), 'granted');
reset role;
select pg_temp.expect_eq('status becomes premium and paid', (select status::text || '/' || payment_status from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), 'premium/paid');
select pg_temp.expect_eq('period is exactly one calendar month from the payment', (select subscription_end from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), '2026-11-01 09:00:00+00'::timestamptz);
select pg_temp.expect_eq('Paystack codes are stored', (select paystack_customer_code || '/' || paystack_subscription_code from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), 'CUS_ann/SUB_ann1');
select pg_temp.expect_eq('payment row is success with the verified amount', (select status || '/' || amount_kobo::text from public.payments where reference='UC-ann-0001-aaaa'), 'success/499900');
select pg_temp.expect_eq('an audit row was written', (select count(*)::int from public.audit_log where action='paystack_payment' and target_id='a0000000-0000-0000-0000-00000000000a'), 1);

-- ===== duplicates never extend twice =====
set role service_role;
select pg_temp.expect_eq('same reference again is a duplicate', public.apply_paystack_charge('UC-ann-0001-aaaa', 'tx1001', 499900, 'NGN', '2026-10-01 09:00:00+00', 'CUS_ann', 'SUB_ann1', 'PLN_test'), 'duplicate');
select pg_temp.expect_eq('same transaction id under another reference is a duplicate', public.apply_paystack_charge('UC-other-ref-0001', 'tx1001', 499900, 'NGN', '2026-10-01 09:00:00+00', 'CUS_ann', 'SUB_ann1', 'PLN_test'), 'duplicate');
select pg_temp.expect_eq('same reference with a DIFFERENT transaction id is still a duplicate', public.apply_paystack_charge('UC-ann-0001-aaaa', 'tx-other', 499900, 'NGN', '2026-10-01 09:00:00+00', 'CUS_ann', 'SUB_ann1', 'PLN_test'), 'duplicate');
select pg_temp.expect_eq('same reference with NO transaction id is still a duplicate', public.apply_paystack_charge('UC-ann-0001-aaaa', null, 499900, 'NGN', '2026-10-01 09:00:00+00', 'CUS_ann', 'SUB_ann1', 'PLN_test'), 'duplicate');
select pg_temp.expect_eq('same transaction id with a NEW reference and the same customer is a duplicate (renewal replay)', public.apply_paystack_charge('RN-replay-0000-01', 'tx1001', 499900, 'NGN', '2026-10-01 09:00:00+00', 'CUS_ann', 'SUB_ann1', 'PLN_test'), 'duplicate');
reset role;
select pg_temp.expect_eq('the period did not move after duplicates', (select subscription_end from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), '2026-11-01 09:00:00+00'::timestamptz);
select pg_temp.expect_eq('only one payment row exists for it', (select count(*)::int from public.payments where user_id='a0000000-0000-0000-0000-00000000000a'), 1);

-- ===== renewals =====
set role service_role;
select pg_temp.expect_eq('renewal on a stored customer code is granted', public.apply_paystack_charge('RN-ann-202611-0001', 'tx1002', 499900, 'NGN', '2026-10-31 23:00:00+00', 'CUS_ann', 'SUB_ann1', 'PLN_test'), 'granted');
reset role;
select pg_temp.expect_eq('a renewal paid slightly early extends from the old end (no lost days)', (select subscription_end from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), '2026-12-01 09:00:00+00'::timestamptz);
select pg_temp.expect_eq('the renewal is recorded as a renewal', (select kind from public.payments where reference='RN-ann-202611-0001'), 'renewal');
set role service_role;
select pg_temp.expect_eq('a charge for an unknown customer code is unmatched, nothing created', public.apply_paystack_charge('RN-zzz-0000-0001', 'tx9001', 499900, 'NGN', now(), 'CUS_nobody', null, 'PLN_test'), 'unmatched');
select pg_temp.expect_eq('a charge with no customer code and no checkout is unmatched', public.apply_paystack_charge('RN-zzz-0000-0002', 'tx9002', 499900, 'NGN', now(), null, null, 'PLN_test'), 'unmatched');
reset role;
select pg_temp.expect_eq('unmatched charges created no payment rows', (select count(*)::int from public.payments where reference like 'RN-zzz%'), 0);

-- ===== amount / currency / input checks =====
set role service_role;
select public.create_checkout_payment('b0000000-0000-0000-0000-00000000000b', 'UC-ben-0001-bbbb', 499900, 'PLN_test');
select pg_temp.expect_eq('wrong amount is a mismatch', public.apply_paystack_charge('UC-ben-0001-bbbb', 'tx2001', 100, 'NGN', now(), 'CUS_ben', 'SUB_ben1', 'PLN_test'), 'mismatch');
reset role;
select pg_temp.expect_eq('a mismatch grants nothing', (select status::text from public.entitlements where user_id='b0000000-0000-0000-0000-00000000000b'), 'free');
select pg_temp.expect_eq('the mismatch is recorded for review', (select status from public.payments where reference='UC-ben-0001-bbbb'), 'mismatch');
set role service_role;
select pg_temp.expect_eq('a reference that was settled as a mismatch can still be granted if Paystack later reports the expected amount for it', public.apply_paystack_charge('UC-ben-0001-bbbb', 'tx2002', 499900, 'NGN', now(), 'CUS_ben', 'SUB_ben1', 'PLN_test'), 'granted');
reset role;
select pg_temp.expect_eq('... and then the account is premium (the verified amount is the source of truth)', (select status::text from public.entitlements where user_id='b0000000-0000-0000-0000-00000000000b'), 'premium');
set role service_role;
select public.create_checkout_payment('c0000000-0000-0000-0000-00000000000c', 'UC-cat-0001-cccc', 499900, 'PLN_test');
select pg_temp.expect_eq('wrong currency is a mismatch', public.apply_paystack_charge('UC-cat-0001-cccc', 'tx3001', 499900, 'USD', now(), 'CUS_cat', 'SUB_cat1', 'PLN_test'), 'mismatch');
select pg_temp.expect_eq('a reference not created by us for a user, with a made-up format, is rejected', public.apply_paystack_charge('bad ref!', 'tx4', 499900, 'NGN', now(), 'CUS_ann', null, null), 'rejected');
select pg_temp.expect_eq('a zero amount is rejected', public.apply_paystack_charge('UC-zero-0000-0001', 'tx5', 0, 'NGN', now(), 'CUS_ann', null, null), 'rejected');
select pg_temp.expect_eq('a negative amount is rejected', public.apply_paystack_charge('UC-neg-0000-0001', 'tx6', -5, 'NGN', now(), 'CUS_ann', null, null), 'rejected');
reset role;
select pg_temp.expect_eq('cat is still free after the bad attempts', (select status::text from public.entitlements where user_id='c0000000-0000-0000-0000-00000000000c'), 'free');

-- a USD renewal on a known customer is recorded as a mismatch and does not extend
set role service_role;
select pg_temp.expect_eq('a renewal in USD is a mismatch', public.apply_paystack_charge('RN-ann-usd-0001', 'tx7001', 499900, 'USD', now(), 'CUS_ann', null, 'PLN_test'), 'mismatch');
reset role;
select pg_temp.expect_eq('the USD renewal did not extend the period', (select subscription_end from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), '2026-12-01 09:00:00+00'::timestamptz);

-- ===== special accounts =====
set role service_role;
select public.create_checkout_payment('f0000000-0000-0000-0000-00000000000f', 'UC-fay-0001-ffff', 499900, 'PLN_test');
select pg_temp.expect_eq('a founding member who pays is recorded but not changed', public.apply_paystack_charge('UC-fay-0001-ffff', 'tx8001', 499900, 'NGN', now(), 'CUS_fay', 'SUB_fay1', 'PLN_test'), 'recorded_no_change');
reset role;
select pg_temp.expect_eq('founding status is untouched', (select status::text from public.entitlements where user_id='f0000000-0000-0000-0000-00000000000f'), 'founding_member');
set role service_role;
select public.create_checkout_payment('90000000-0000-0000-0000-000000000009', 'UC-gus-0001-gggg', 499900, 'PLN_test');
select pg_temp.expect_eq('a complimentary user who pays becomes premium', public.apply_paystack_charge('UC-gus-0001-gggg', 'tx8002', 499900, 'NGN', now(), 'CUS_gus', 'SUB_gus1', 'PLN_test'), 'granted');
reset role;
select pg_temp.expect_eq('the gift reason is cleared', (select status::text || '/' || coalesce(grant_reason, 'none') from public.entitlements where user_id='90000000-0000-0000-0000-000000000009'), 'premium/none');

-- ===== lapsed users, future dates =====
update public.entitlements set subscription_end = now() - interval '40 days', subscription_start = now() - interval '70 days' where user_id='b0000000-0000-0000-0000-00000000000b';
set role service_role;
select pg_temp.expect_eq('a renewal after the period lapsed starts from the payment date', public.apply_paystack_charge('RN-ben-0001-late', 'tx2003', 499900, 'NGN', '2026-10-05 12:00:00+00', 'CUS_ben', null, 'PLN_test'), 'granted');
reset role;
select pg_temp.expect_eq('lapsed renewal period = payment date + 1 month', (select subscription_end from public.entitlements where user_id='b0000000-0000-0000-0000-00000000000b'), '2026-11-05 12:00:00+00'::timestamptz);
set role service_role;
select public.create_checkout_payment('c0000000-0000-0000-0000-00000000000c', 'UC-cat-0002-cccc', 499900, 'PLN_test');
select public.apply_paystack_charge('UC-cat-0002-cccc', 'tx3002', 499900, 'NGN', now() + interval '300 days', 'CUS_cat', 'SUB_cat1', 'PLN_test');
reset role;
select pg_temp.expect_eq('a payment date far in the future is clamped to now (cannot buy extra months)', (select subscription_end < now() + interval '32 days' from public.entitlements where user_id='c0000000-0000-0000-0000-00000000000c'), true);

-- ===== the grant is what has_premium() sees =====
set role authenticated; set request.jwt.claim.sub = 'c0000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq('has_premium() is true for a paid user', public.has_premium(), true);
reset role;

-- ===== subscription events =====
set role service_role;
select pg_temp.expect_eq('not_renew marks the cancellation as scheduled', public.apply_paystack_subscription_event('not_renew', 'CUS_ann', 'SUB_ann1', null), 'updated');
reset role;
select pg_temp.expect_eq('access is untouched by not_renew', (select status::text || '/' || cancellation_status from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), 'premium/scheduled');
set role service_role;
select pg_temp.expect_eq('disable for a DIFFERENT subscription code is ignored (old subscription after re-subscribing)', public.apply_paystack_subscription_event('disable', 'CUS_ann', 'SUB_old_one', null), 'unmatched');
select pg_temp.expect_eq('disable for the stored subscription cancels', public.apply_paystack_subscription_event('disable', 'CUS_ann', 'SUB_ann1', null), 'updated');
reset role;
select pg_temp.expect_eq('cancelled keeps the paid period', (select status::text || '/' || cancellation_status || '/' || (subscription_end > now() + interval '30 days')::text from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), 'cancelled/cancelled/true');
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000a';
select pg_temp.expect_eq('has_premium() is still true until the period ends after cancelling', public.has_premium(), true);
reset role;
set role service_role;
select pg_temp.expect_eq('events never touch founding members', public.apply_paystack_subscription_event('disable', 'CUS_fay', 'SUB_fay1', null), 'unmatched');
select pg_temp.expect_eq('disable on an already-cancelled user is ignored', public.apply_paystack_subscription_event('disable', 'CUS_ann', 'SUB_ann1', null), 'ignored');
select pg_temp.expect_eq('unknown event kinds are ignored', public.apply_paystack_subscription_event('explode', 'CUS_ann', 'SUB_ann1', null), 'ignored');
select pg_temp.expect_eq('a subscription.create attaches codes by e-mail but grants nothing', public.apply_paystack_subscription_event('create', 'CUS_hal', 'SUB_hal1', 'HAL@Example.test'), 'updated');
reset role;
select pg_temp.expect_eq('hal has codes and is still free', (select paystack_customer_code || '/' || paystack_subscription_code || '/' || status::text from public.entitlements where user_id='a1000000-0000-0000-0000-0000000000a1'), 'CUS_hal/SUB_hal1/free');
set role service_role;
select pg_temp.expect_eq('create for an unknown e-mail is unmatched', public.apply_paystack_subscription_event('create', 'CUS_x', 'SUB_x', 'nobody@example.test'), 'unmatched');
select pg_temp.expect_eq('create cannot hijack a user who already has a different customer code', public.apply_paystack_subscription_event('create', 'CUS_evil', 'SUB_evil', 'hal@example.test'), 'ignored');
reset role;

-- ===== isolation and privacy =====
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000a';
select pg_temp.expect_eq('a user sees only their own payments (checkout, renewal and the USD mismatch)', (select count(*)::int from public.payments), 3);
select pg_temp.expect_eq('all visible payments are theirs', (select count(*)::int from public.payments where user_id <> 'a0000000-0000-0000-0000-00000000000a'), 0);
select pg_temp.expect_fail('a user cannot insert a payment', $$insert into public.payments (user_id, reference, kind, status) values ('a0000000-0000-0000-0000-00000000000a','UC-self-0000-0001','checkout','success')$$);
select pg_temp.expect_fail('a user cannot update a payment', $$update public.payments set status='success'$$);
select pg_temp.expect_fail('a user cannot delete a payment', $$delete from public.payments$$);
select pg_temp.expect_fail('a user cannot read webhook events', $$select * from public.webhook_events$$);
select pg_temp.expect_fail('a user cannot upgrade themselves through the entitlements table', $$update public.entitlements set status='premium'$$);
reset role;
set role anon;
select pg_temp.expect_fail('anon cannot read payments', $$select * from public.payments$$);
reset role;
select pg_temp.expect_eq('the price setting was never changed by payments', (select (value->>'amount_kobo')::bigint from public.app_settings where key='premium_price'), 499900::bigint);

-- ===== webhook de-duplication =====
set role service_role;
select pg_temp.expect_eq('first delivery is processed', public.claim_webhook_event(repeat('a', 64), 'charge.success'), true);
select pg_temp.expect_eq('a repeat while unfinished is processed again (crash safety)', public.claim_webhook_event(repeat('a', 64), 'charge.success'), true);
select public.finish_webhook_event(repeat('a', 64), 'granted', 'ok');
select pg_temp.expect_eq('a repeat after success is skipped', public.claim_webhook_event(repeat('a', 64), 'charge.success'), false);
select public.claim_webhook_event(repeat('b', 64), 'charge.success');
select public.finish_webhook_event(repeat('b', 64), 'error', 'database down');
select pg_temp.expect_eq('a delivery that ended in error is processed again on retry', public.claim_webhook_event(repeat('b', 64), 'charge.success'), true);
select pg_temp.expect_fail('a malformed body hash is refused', $$select public.claim_webhook_event('not-a-hash', 'x')$$);
reset role;

-- ===== history outlives the account =====
delete from auth.users where id='a0000000-0000-0000-0000-00000000000a';
select pg_temp.expect_eq('payment history is kept after the account is deleted', (select count(*)::int from public.payments where user_id='a0000000-0000-0000-0000-00000000000a'), 3);

\o
\echo
select 'TOTAL ' || count(*) || '  PASSED ' || count(*) filter (where ok) || '  FAILED ' || count(*) filter (where not ok) as summary from results;
select name as failed_check from results where not ok;
