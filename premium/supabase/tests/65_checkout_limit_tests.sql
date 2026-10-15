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
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-00000000000a','ann@example.test'), ('b0000000-0000-0000-0000-00000000000b','ben@example.test');
set role service_role;
select public.create_checkout_payment('a0000000-0000-0000-0000-00000000000a', 'UC-lim-0000-000' || g, 499900, 'PLN_test') from generate_series(1, 5) g;
select pg_temp.expect_fail('a sixth unfinished checkout within an hour is refused', $$select public.create_checkout_payment('a0000000-0000-0000-0000-00000000000a', 'UC-lim-0000-0006', 499900, 'PLN_test')$$);
select pg_temp.expect_eq('the refused attempt created no row', (select count(*)::int from public.payments where user_id='a0000000-0000-0000-0000-00000000000a'), 5);
select public.create_checkout_payment('b0000000-0000-0000-0000-00000000000b', 'UC-lim-ben-0001', 499900, 'PLN_test');
select pg_temp.expect_eq('another person is not affected by the limit', (select count(*)::int from public.payments where user_id='b0000000-0000-0000-0000-00000000000b'), 1);
reset role;
update public.payments set created_at = now() - interval '2 hours' where user_id='a0000000-0000-0000-0000-00000000000a' and reference in ('UC-lim-0000-0001','UC-lim-0000-0002');
set role service_role;
select public.create_checkout_payment('a0000000-0000-0000-0000-00000000000a', 'UC-lim-0000-0007', 499900, 'PLN_test');
select pg_temp.expect_eq('old unfinished checkouts (over an hour) stop counting', (select count(*)::int from public.payments where user_id='a0000000-0000-0000-0000-00000000000a'), 6);
update public.payments set status = 'success', paystack_tx_id = 'tx-' || reference where user_id='a0000000-0000-0000-0000-00000000000a' and status='pending';
reset role;
insert into public.payments (user_id, reference, kind, status, amount_kobo, expected_amount_kobo, currency, paystack_tx_id) values ('a0000000-0000-0000-0000-00000000000a', 'UC-lim-done-0001', 'checkout', 'success', 499900, 499900, 'NGN', 'tx-extra');
set role service_role;
select public.create_checkout_payment('a0000000-0000-0000-0000-00000000000a', 'UC-lim-0000-0008', 499900, 'PLN_test');
select pg_temp.expect_eq('finished checkouts do not count against the limit', (select count(*)::int from public.payments where user_id='a0000000-0000-0000-0000-00000000000a' and status='pending'), 1);
reset role;
select pg_temp.expect_eq('authenticated users still cannot call it', has_function_privilege('authenticated', 'public.create_checkout_payment(uuid,text,bigint,text)', 'execute'), false);
select pg_temp.expect_eq('service role still can', has_function_privilege('service_role', 'public.create_checkout_payment(uuid,text,bigint,text)', 'execute'), true);
\o
\echo
select 'TOTAL ' || count(*) || '  PASSED ' || count(*) filter (where ok) || '  FAILED ' || count(*) filter (where not ok) as summary from results;
select name as failed_check from results where not ok;
