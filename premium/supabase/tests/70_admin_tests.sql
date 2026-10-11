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
create function pg_temp.expect_fail_code(name text, stmt text, code text) returns void language plpgsql as $$
begin
  begin execute stmt; insert into results values (name, false); raise notice 'FAIL  %  (statement unexpectedly succeeded)', name;
  exception when others then
    if sqlstate = code then insert into results values (name, true); raise notice 'PASS  %', name;
    else insert into results values (name, false); raise notice 'FAIL  %  (wrong error %)', name, sqlstate; end if; end;
end $$;
create function pg_temp.expect_eq(name text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is not distinct from want then insert into results values (name, true); raise notice 'PASS  %', name;
  else insert into results values (name, false); raise notice 'FAIL  %  (got %, wanted %)', name, got, want; end if;
end $$;

-- users: owner(admin) own, adm(admin) , ann premium (paid), ben free, cat cancelled-but-paid, dee expired, fay founding, gus complimentary, hal free named "100%_Sure O'Neil"
insert into auth.users (id, email, created_at) values
 ('00000000-0000-0000-0000-0000000000a1','owner@example.test', now() - interval '60 days'),
 ('00000000-0000-0000-0000-0000000000a2','adm@example.test', now() - interval '50 days'),
 ('a0000000-0000-0000-0000-00000000000a','ann@example.test', now() - interval '40 days'),
 ('b0000000-0000-0000-0000-00000000000b','ben@example.test', now() - interval '30 days'),
 ('c0000000-0000-0000-0000-00000000000c','cat@example.test', now() - interval '20 days'),
 ('d0000000-0000-0000-0000-00000000000d','dee@example.test', now() - interval '10 days'),
 ('f0000000-0000-0000-0000-00000000000f','fay@example.test', now() - interval '5 days'),
 ('90000000-0000-0000-0000-000000000009','gus@example.test', now() - interval '3 days'),
 ('a1000000-0000-0000-0000-0000000000a1','hal@example.test', now() - interval '1 day');
insert into public.admin_users (user_id, role) values ('00000000-0000-0000-0000-0000000000a1','owner'), ('00000000-0000-0000-0000-0000000000a2','admin');
update public.profiles set full_name = '100%_Sure O''Neil' where id='a1000000-0000-0000-0000-0000000000a1';
update public.profiles set full_name = 'Ann Okafor' where id='a0000000-0000-0000-0000-00000000000a';
update public.entitlements set status='premium', payment_status='paid', subscription_start=now()-interval '10 days', subscription_end=now()+interval '3 days', paystack_customer_code='CUS_ann', paystack_subscription_code='SUB_ann', cancellation_status='scheduled' where user_id='a0000000-0000-0000-0000-00000000000a';
update public.entitlements set status='cancelled', payment_status='paid', subscription_start=now()-interval '25 days', subscription_end=now()+interval '20 days', cancellation_status='cancelled' where user_id='c0000000-0000-0000-0000-00000000000c';
update public.entitlements set status='expired', payment_status='paid', subscription_start=now()-interval '60 days', subscription_end=now()-interval '2 days' where user_id='d0000000-0000-0000-0000-00000000000d';
update public.entitlements set status='founding_member', subscription_start=now()-interval '1 day' where user_id='f0000000-0000-0000-0000-00000000000f';
update public.entitlements set status='complimentary', subscription_start=now()-interval '1 day', subscription_end=now()+interval '10 days', grant_reason='gift' where user_id='90000000-0000-0000-0000-000000000009';
-- payments and webhooks (written the way the service role would)
insert into public.payments (user_id, reference, kind, status, amount_kobo, expected_amount_kobo, currency, paid_at, created_at, paystack_tx_id) values
 ('a0000000-0000-0000-0000-00000000000a','UC-ann-0001-aaaa','checkout','success',499900,499900,'NGN', now()-interval '10 days', now()-interval '10 days','t1'),
 ('a0000000-0000-0000-0000-00000000000a','RN-ann-0002-bbbb','renewal','success',499900,null,'NGN', now()-interval '1 hour', now()-interval '1 hour','t2'),
 ('c0000000-0000-0000-0000-00000000000c','UC-cat-0001-cccc','checkout','success',499900,499900,'NGN', now()-interval '25 days', now()-interval '25 days','t3'),
 ('b0000000-0000-0000-0000-00000000000b','UC-ben-0001-dddd','checkout','mismatch',100,499900,'NGN', null, now()-interval '2 days', null),
 ('b0000000-0000-0000-0000-00000000000b','UC-ben-0002-eeee','checkout','pending',null,499900,'NGN', null, now()-interval '3 hours', null),
 ('c0000000-0000-0000-0000-00000000000c','UC-cat-0002-usd0','renewal','success',999900,null,'USD', now()-interval '1 day', now()-interval '1 day','t4');
insert into public.webhook_events (body_hash, event, outcome, detail, received_at) values
 (repeat('1',64),'charge.success','granted',null, now()-interval '1 hour'),
 (repeat('2',64),'charge.success','error','database refused', now()-interval '2 hours'),
 (repeat('3',64),'charge.success','not_verified','transaction status is failed', now()-interval '3 hours'),
 (repeat('4',64),'subscription.create','updated',null, now()-interval '30 hours'),
 (repeat('5',64),'charge.success',null,null, now()-interval '10 minutes'),
 (repeat('6',64),'charge.success',null,null, now()-interval '5 seconds');

-- ===== who may call what =====
select pg_temp.expect_eq('anon cannot execute admin_list_users', has_function_privilege('anon', 'public.admin_list_users(text,text,integer,integer)', 'execute'), false);
select pg_temp.expect_eq('anon cannot execute admin_stats', has_function_privilege('anon', 'public.admin_stats()', 'execute'), false);
select pg_temp.expect_eq('anon cannot execute admin_end_paid_access', has_function_privilege('anon', 'public.admin_end_paid_access(uuid,text)', 'execute'), false);
select pg_temp.expect_eq('nobody can call the internal premium_active_for directly', has_function_privilege('authenticated', 'public.premium_active_for(uuid)', 'execute') or has_function_privilege('anon', 'public.premium_active_for(uuid)', 'execute'), false);
select pg_temp.expect_eq('nobody can call admin_require or admin_like directly', has_function_privilege('authenticated', 'public.admin_require()', 'execute') or has_function_privilege('authenticated', 'public.admin_like(text)', 'execute'), false);
select pg_temp.expect_eq('PUBLIC cannot execute any admin function', (select count(*)::int from pg_proc p where p.proname like 'admin\_%' and p.proname not in ('admin_grant_complimentary','admin_revoke_complimentary','admin_set_premium_price') and has_function_privilege('public', p.oid, 'execute')), 0);

set role anon;
select pg_temp.expect_fail('anon is refused outright', $$select * from public.admin_list_users()$$);
reset role;

-- a normal signed-in user is refused with 42501 on every admin function
set role authenticated; set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail_code('non-admin: list users', $$select * from public.admin_list_users()$$, '42501');
select pg_temp.expect_fail_code('non-admin: user detail', $$select public.admin_user_detail('a0000000-0000-0000-0000-00000000000a')$$, '42501');
select pg_temp.expect_fail_code('non-admin: list payments', $$select * from public.admin_list_payments()$$, '42501');
select pg_temp.expect_fail_code('non-admin: list webhooks', $$select * from public.admin_list_webhooks()$$, '42501');
select pg_temp.expect_fail_code('non-admin: stats', $$select public.admin_stats()$$, '42501');
select pg_temp.expect_fail_code('non-admin: end paid access', $$select public.admin_end_paid_access('a0000000-0000-0000-0000-00000000000a','x')$$, '42501');
reset role;
-- someone with no JWT subject at all
set role authenticated; reset request.jwt.claim.sub;
select pg_temp.expect_fail_code('signed-in role with no user id is refused', $$select public.admin_stats()$$, '42501');
reset role;

-- ===== admin: users =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_eq('all: lists every account', (select count(*)::int from public.admin_list_users()), 9);
select pg_temp.expect_eq('total column carries the full count even when paged', (select max(total)::int from public.admin_list_users(null,'all',3,0)), 9);
select pg_temp.expect_eq('page size is respected', (select count(*)::int from public.admin_list_users(null,'all',3,0)), 3);
select pg_temp.expect_eq('page size above 100 is capped, below 1 becomes 1', (select count(*)::int from public.admin_list_users(null,'all',100000,0)) = 9 and (select count(*)::int from public.admin_list_users(null,'all',0,0)) = 1, true);
select pg_temp.expect_eq('newest sign-up first', (select email from public.admin_list_users(null,'all',1,0)), 'hal@example.test');
select pg_temp.expect_eq('offset works', (select email from public.admin_list_users(null,'all',1,1)), 'gus@example.test');
select pg_temp.expect_eq('premium_now filter: ann, cat(cancelled, still paid), fay, gus', (select string_agg(email, ',' order by email) from public.admin_list_users(null,'premium_now',50,0)), 'ann@example.test,cat@example.test,fay@example.test,gus@example.test');
select pg_temp.expect_eq('not_premium filter: the rest (including the expired one and both admins)', (select string_agg(email, ',' order by email) from public.admin_list_users(null,'not_premium',50,0)), 'adm@example.test,ben@example.test,dee@example.test,hal@example.test,owner@example.test');
select pg_temp.expect_eq('paying filter: ann and cat only (not founding, not complimentary)', (select string_agg(email, ',' order by email) from public.admin_list_users(null,'paying',50,0)), 'ann@example.test,cat@example.test');
select pg_temp.expect_eq('expiring_soon: only ann (3 days left)', (select string_agg(email, ',') from public.admin_list_users(null,'expiring_soon',50,0)), 'ann@example.test');
select pg_temp.expect_eq('status filters: founding / complimentary / expired / cancelled / free',
  (select (select count(*) from public.admin_list_users(null,'founding_member',50,0))::text || (select count(*) from public.admin_list_users(null,'complimentary',50,0))::text || (select count(*) from public.admin_list_users(null,'expired',50,0))::text || (select count(*) from public.admin_list_users(null,'cancelled',50,0))::text || (select count(*) from public.admin_list_users(null,'free',50,0))::text), '11114');
select pg_temp.expect_eq('search by e-mail part', (select string_agg(email, ',') from public.admin_list_users('ann@','all',50,0)), 'ann@example.test');
select pg_temp.expect_eq('search by name, case-insensitive', (select string_agg(email, ',') from public.admin_list_users('OKAFOR','all',50,0)), 'ann@example.test');
select pg_temp.expect_eq('search text with % and _ is literal, not a wildcard', (select string_agg(email, ',') from public.admin_list_users('100%_Sure','all',50,0)), 'hal@example.test');
select pg_temp.expect_eq('a lone % matches only names that really contain a percent sign', (select count(*)::int from public.admin_list_users('%','all',50,0)), 1);
select pg_temp.expect_eq('a lone _ matches only text that really contains an underscore', (select count(*)::int from public.admin_list_users('_','all',50,0)), 1);
select pg_temp.expect_eq('a backslash is literal', (select count(*)::int from public.admin_list_users('\','all',50,0)), 0);
select pg_temp.expect_eq('an apostrophe cannot break the query', (select count(*)::int from public.admin_list_users($$' or 1=1 --$$,'all',50,0)), 0);
select pg_temp.expect_eq('empty or blank search lists everyone', (select count(*)::int from public.admin_list_users('   ','all',50,0)), 9);
select pg_temp.expect_fail('unknown filter is refused', $$select * from public.admin_list_users(null,'; drop table x',10,0)$$);
select pg_temp.expect_fail('null filter is refused', $$select * from public.admin_list_users(null,null,10,0)$$);
create temp table listed as select user_id, premium_now from public.admin_list_users(null,'all',100,0);
grant all on listed to public;
select pg_temp.expect_eq('linked_to_paystack is true only for ann', (select string_agg(email, ',') from public.admin_list_users(null,'all',50,0) where linked_to_paystack), 'ann@example.test');
reset role;
select pg_temp.expect_eq('premium_now agrees with the function behind has_premium() for every user', (select count(*)::int from listed l where l.premium_now is distinct from public.premium_active_for(l.user_id)), 0);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_fail('an admin cannot call the internal premium_active_for directly', $$select public.premium_active_for('a0000000-0000-0000-0000-00000000000a')$$);
-- a second admin has the same powers
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect_eq('the second admin role works too', (select count(*)::int from public.admin_list_users()), 9);
reset role;

-- ===== has_premium() still decides each user correctly after being rewritten to delegate =====
select pg_temp.expect_eq('has_premium() for ann is true', (select public.premium_active_for('a0000000-0000-0000-0000-00000000000a')), true);
set role authenticated; set request.jwt.claim.sub = 'd0000000-0000-0000-0000-00000000000d';
select pg_temp.expect_eq('has_premium() (policy helper) is false for the expired user', public.has_premium(), false);
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq('has_premium() is true for the cancelled-but-paid user', public.has_premium(), true);
reset role;

-- ===== admin: detail (and it is logged) =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_eq('detail: email and plan', (select (public.admin_user_detail('a0000000-0000-0000-0000-00000000000a')->>'email') || '/' || (public.admin_user_detail('a0000000-0000-0000-0000-00000000000a')->>'status')), 'ann@example.test/premium');
select pg_temp.expect_eq('detail: payments are included', (select jsonb_array_length(public.admin_user_detail('a0000000-0000-0000-0000-00000000000a')->'payments')), 2);
select pg_temp.expect_eq('detail returns exactly the expected account, plan, payment and history fields and nothing else', (select string_agg(k, ',' order by k) from jsonb_object_keys(public.admin_user_detail('a0000000-0000-0000-0000-00000000000a')) k), 'cancellation_status,email,full_name,grant_reason,history,payment_status,payments,paystack_customer_code,paystack_subscription_code,premium_now,signed_up,status,subscription_end,subscription_start,trial_end,user_id');
select pg_temp.expect_fail('detail for an unknown user is refused', $$select public.admin_user_detail('00000000-0000-0000-0000-000000000bad')$$);
reset role;
select pg_temp.expect_eq('each detail view wrote an audit row naming the admin', (select count(*)::int from public.audit_log where action='admin_view_user' and actor_id='00000000-0000-0000-0000-0000000000a1' and target_id='a0000000-0000-0000-0000-00000000000a') >= 3, true);

-- ===== admin: payments =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_eq('payments: all', (select count(*)::int from public.admin_list_payments()), 6);
select pg_temp.expect_eq('payments: mismatch only', (select string_agg(reference, ',') from public.admin_list_payments(null,'mismatch',50,0)), 'UC-ben-0001-dddd');
select pg_temp.expect_eq('payments: pending only', (select string_agg(reference, ',') from public.admin_list_payments(null,'pending',50,0)), 'UC-ben-0002-eeee');
select pg_temp.expect_eq('payments: search by e-mail', (select count(*)::int from public.admin_list_payments('ann@','all',50,0)), 2);
select pg_temp.expect_eq('payments: search by reference', (select string_agg(reference, ',') from public.admin_list_payments('RN-ann','all',50,0)), 'RN-ann-0002-bbbb');
select pg_temp.expect_eq('payments: newest first', (select reference from public.admin_list_payments(null,'all',1,0)), 'RN-ann-0002-bbbb');
select pg_temp.expect_fail('payments: unknown filter refused', $$select * from public.admin_list_payments(null,'x',10,0)$$);
reset role;

-- ===== admin: webhooks =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_eq('webhooks: all', (select count(*)::int from public.admin_list_webhooks('all',50,0)), 6);
select pg_temp.expect_eq('webhooks: errors only', (select count(*)::int from public.admin_list_webhooks('error',50,0)), 1);
select pg_temp.expect_eq('webhooks: unfinished means no outcome for over 2 minutes (not the one from 5 seconds ago)', (select count(*)::int from public.admin_list_webhooks('unfinished',50,0)), 1);
select pg_temp.expect_eq('webhooks: problems = error + not_verified + the stuck one', (select count(*)::int from public.admin_list_webhooks('problems',50,0)), 3);
select pg_temp.expect_eq('webhooks: default filter is problems', (select count(*)::int from public.admin_list_webhooks()), 3);
select pg_temp.expect_eq('webhook list columns do not include the body hash', (select array_to_string(proargnames, ',') like '%hash%' from pg_proc where proname='admin_list_webhooks'), false);
select pg_temp.expect_fail('webhooks: unknown filter refused', $$select * from public.admin_list_webhooks('x',10,0)$$);
reset role;

-- ===== admin: statistics =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
create temp table st as select public.admin_stats() as j;
grant all on st to public;
select pg_temp.expect_eq('stats: users total', (select (j->>'users_total')::int from st), 9);
select pg_temp.expect_eq('stats: premium now (ann, cat, fay, gus)', (select (j->>'premium_now')::int from st), 4);
select pg_temp.expect_eq('stats: paying now (ann, cat)', (select (j->>'paying_now')::int from st), 2);
select pg_temp.expect_eq('stats: expiring within 7 days (ann)', (select (j->>'expiring_7d')::int from st), 1);
select pg_temp.expect_eq('stats: will not renew (ann is scheduled)', (select (j->>'will_not_renew')::int from st), 1);
select pg_temp.expect_eq('stats: signups in 7 days (fay, gus, hal)', (select (j->>'signups_7d')::int from st), 3);
select pg_temp.expect_eq('stats: revenue all time counts NGN successes only (3 x 4,999)', (select (j->>'revenue_kobo_all')::bigint from st), 1499700::bigint);
select pg_temp.expect_eq('stats: the USD payment is never added to naira revenue', (select (j->>'revenue_kobo_all')::bigint from st) < 2000000, true);
select pg_temp.expect_eq('stats: mismatches are not revenue', (select (j->>'payments_mismatch')::int from st), 1);
select pg_temp.expect_eq('stats: pending over an hour', (select (j->>'payments_pending_over_1h')::int from st), 1);
select pg_temp.expect_eq('stats: webhooks in 24h (5; one is 30 hours old)', (select (j->>'webhooks_24h')::int from st), 5);
select pg_temp.expect_eq('stats: webhook problems in 24h (error, not_verified, stuck)', (select (j->>'webhook_problems_24h')::int from st), 3);
select pg_temp.expect_eq('stats: by_status counts add up to the user total', (select (select sum(value::int) from jsonb_each_text(j->'by_status')) from st)::bigint, 9::bigint);
select pg_temp.expect_eq('stats: revenue by month adds up to the all-time figure when all payments are recent', (select (select sum((e->>'amount_kobo')::bigint) from jsonb_array_elements(j->'revenue_by_month') e)::bigint from st), 1499700::bigint);
reset role;

-- ===== admin: end paid access after a refund =====
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_fail('a reason is required', $$select public.admin_end_paid_access('a0000000-0000-0000-0000-00000000000a','   ')$$);
select pg_temp.expect_fail('a reason over 500 characters is refused', $$select public.admin_end_paid_access('a0000000-0000-0000-0000-00000000000a', repeat('x',501))$$);
select pg_temp.expect_fail('cannot end a founding member here', $$select public.admin_end_paid_access('f0000000-0000-0000-0000-00000000000f','refund')$$);
select pg_temp.expect_fail('cannot end complimentary access here (use revoke)', $$select public.admin_end_paid_access('90000000-0000-0000-0000-000000000009','refund')$$);
select pg_temp.expect_fail('cannot end a free account', $$select public.admin_end_paid_access('b0000000-0000-0000-0000-00000000000b','refund')$$);
select pg_temp.expect_fail('unknown user refused', $$select public.admin_end_paid_access('00000000-0000-0000-0000-000000000bad','refund')$$);
select public.admin_end_paid_access('a0000000-0000-0000-0000-00000000000a', 'Refunded in Paystack, ticket 41');
reset role;
select pg_temp.expect_eq('after ending: expired and marked refunded', (select status::text || '/' || payment_status from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), 'expired/refunded');
select pg_temp.expect_eq('after ending: the paid-until date is now in the past, not left in the future', (select subscription_end <= now() from public.entitlements where user_id='a0000000-0000-0000-0000-00000000000a'), true);
select pg_temp.expect_eq('after ending: no longer has Premium', public.premium_active_for('a0000000-0000-0000-0000-00000000000a'), false);
select pg_temp.expect_eq('audit row records admin, previous status and reason', (select actor_id::text || '|' || (details->>'previous_status') || '|' || (details->>'reason') from public.audit_log where action='end_paid_access' and target_id='a0000000-0000-0000-0000-00000000000a'), '00000000-0000-0000-0000-0000000000a1|premium|Refunded in Paystack, ticket 41');
select pg_temp.expect_eq('the payment history of that user is untouched', (select count(*)::int from public.payments where user_id='a0000000-0000-0000-0000-00000000000a'), 2);
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_fail('ending twice is refused (already expired)', $$select public.admin_end_paid_access('a0000000-0000-0000-0000-00000000000a','again')$$);
reset role;
-- a webhook renewal after the refund can start a new period (Paystack would only send one if the subscription were still active)
-- the existing grant/revoke functions still work for an admin and still refuse a normal user
set role authenticated; set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail_code('non-admin still cannot grant complimentary access', $$select public.admin_grant_complimentary('b0000000-0000-0000-0000-00000000000b', null, 'self')$$, '42501');
reset role;

-- ===== a large account list is capped at 100 rows per page =====
insert into auth.users (email, created_at) select 'bulk' || g || '@example.test', now() - (g || ' minutes')::interval from generate_series(1, 150) g;
insert into public.payments (user_id, reference, kind, status, amount_kobo, expected_amount_kobo, currency, created_at) select 'b0000000-0000-0000-0000-00000000000b', 'UC-bulk-' || lpad(g::text, 6, '0'), 'checkout', 'pending', null, 499900, 'NGN', now() - (g || ' seconds')::interval from generate_series(1, 150) g;
insert into public.webhook_events (body_hash, event, outcome, received_at) select md5(g::text) || md5((g+1000)::text), 'charge.success', 'granted', now() - (g || ' seconds')::interval from generate_series(1, 150) g;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_eq('a request for 100,000 rows returns at most 100', (select count(*)::int from public.admin_list_users(null,'all',100000,0)), 100);
select pg_temp.expect_eq('the total still reports every account', (select max(total)::int from public.admin_list_users(null,'all',100000,0)), 159);
select pg_temp.expect_eq('the second page of 100 returns the remaining 59', (select count(*)::int from public.admin_list_users(null,'all',100,100)), 59);
select pg_temp.expect_eq('payments list is capped at 100 rows', (select count(*)::int from public.admin_list_payments(null,'all',100000,0)), 100);
select pg_temp.expect_eq('webhook list is capped at 100 rows', (select count(*)::int from public.admin_list_webhooks('all',100000,0)), 100);
reset role;

\o
\echo
select 'TOTAL ' || count(*) || '  PASSED ' || count(*) filter (where ok) || '  FAILED ' || count(*) filter (where not ok) as summary from results;
select name as failed_check from results where not ok;
