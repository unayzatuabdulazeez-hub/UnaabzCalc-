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
-- Moving a record between two businesses of the SAME owner would pass the foreign keys, so only the column grants stop it.
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001','alice@example.test'),('bbbbbbbb-0000-0000-0000-000000000002','bob@example.test');
update public.entitlements set status='complimentary' where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');
insert into public.businesses (id, owner_id, name) values
 ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Alice One'),
 ('a2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Alice Two');
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.customers (business_id, user_id, name) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','C1');
insert into public.products (business_id, user_id, name) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','P1');
insert into public.jobs (business_id, user_id, title) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','J1');
select pg_temp.expect_fail('customer cannot move to another business of the same owner', $$update public.customers set business_id='a2000000-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('product cannot move to another business of the same owner', $$update public.products set business_id='a2000000-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('job cannot move to another business of the same owner', $$update public.jobs set business_id='a2000000-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('customer user_id cannot change', $$update public.customers set user_id='bbbbbbbb-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('job user_id cannot change', $$update public.jobs set user_id='bbbbbbbb-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('records cannot be deleted by the owner (archive only): customers', $$delete from public.customers$$);
select pg_temp.expect_fail('records cannot be deleted by the owner (archive only): jobs', $$delete from public.jobs$$);
insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','S1','{"cost":"1","sell":"2"}','v1');
select pg_temp.expect_fail('saved calculation cannot move to another business of the same owner', $$update public.saved_calculations set business_id='a2000000-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('saved calculation user_id cannot change', $$update public.saved_calculations set user_id='bbbbbbbb-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('saved calculation type cannot change', $$update public.saved_calculations set calculator_id='loan'$$);
select pg_temp.expect_eq('records still sit in their original business', (select (select count(*) from public.customers where business_id='a1000000-0000-0000-0000-000000000001') + (select count(*) from public.products where business_id='a1000000-0000-0000-0000-000000000001') + (select count(*) from public.jobs where business_id='a1000000-0000-0000-0000-000000000001') + (select count(*) from public.saved_calculations where business_id='a1000000-0000-0000-0000-000000000001'))::int, 4);
reset role;
\o
\echo
select 'TOTAL ' || count(*) || '  PASSED ' || count(*) filter (where ok) || '  FAILED ' || count(*) filter (where not ok) as summary from results;
select name as failed_check from results where not ok;
