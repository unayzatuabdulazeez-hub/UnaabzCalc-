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

-- alice, bob = premium; dan = free/lapsed; carol = admin
insert into auth.users (id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','alice@example.test'),
 ('bbbbbbbb-0000-0000-0000-000000000002','bob@example.test'),
 ('dddddddd-0000-0000-0000-000000000004','dan@example.test'),
 ('cccccccc-0000-0000-0000-000000000003','carol@example.test');
insert into public.admin_users (user_id, role) values ('cccccccc-0000-0000-0000-000000000003','owner');
update public.entitlements set status='complimentary' where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');
insert into public.businesses (id, owner_id, name) values
 ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Alice One'),
 ('a2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Alice Two'),
 ('b1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','Bob One'),
 ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','Dan One');
-- trusted setup: records in each business
insert into public.customers (id, business_id, user_id, name) values
 ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Alice customer 1'),
 ('c2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Alice customer 2'),
 ('cb000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','Bob customer');
insert into public.jobs (id, business_id, user_id, title) values
 ('f1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Alice job 1'),
 ('f2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Alice job 2');
insert into public.products (id, business_id, user_id, name) values
 ('e1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Alice product 1'),
 ('e2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Alice product 2');

-- ===== alice (premium) =====
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version, customer_id, job_id, product_id)
 values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','Ankara margin','{"cost":"800","sell":"1000"}','abc123',
 'c1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001');
select pg_temp.expect_eq('premium owner can save a calculation linked to customer, job and product in the same business', (select count(*)::int from public.saved_calculations), 1);
select pg_temp.expect_eq('inputs round-trip exactly', (select inputs->>'sell' from public.saved_calculations), '1000');
select pg_temp.expect_eq('no result column exists (results are recomputed, never stored)', (select count(*)::int from information_schema.columns where table_schema='public' and table_name='saved_calculations' and column_name in ('result','results','output')), 0);
update public.saved_calculations set title='Ankara margin v2', inputs='{"cost":"800","sell":"1200"}', notes='edited';
select pg_temp.expect_eq('owner can edit title, inputs and notes', (select title || ':' || (inputs->>'sell') from public.saved_calculations), 'Ankara margin v2:1200');
update public.saved_calculations set archived_at = now();
select pg_temp.expect_eq('owner can archive', (select count(*)::int from public.saved_calculations where archived_at is not null), 1);
update public.saved_calculations set archived_at = null;
insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version)
  select business_id, user_id, calculator_id, title || ' (copy)', inputs, engine_version from public.saved_calculations;
select pg_temp.expect_eq('owner can duplicate (insert a copy)', (select count(*)::int from public.saved_calculations), 2);
select pg_temp.expect_fail('cannot save into someone else''s business', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('b1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','x','{}','v')$$);
select pg_temp.expect_fail('cannot save into own business as another user', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('a1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','profit','x','{}','v')$$);
select pg_temp.expect_fail('cannot link a customer from ANOTHER business of the same owner', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version, customer_id) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','x','{}','v','c2000000-0000-0000-0000-000000000002')$$);
select pg_temp.expect_fail('cannot link a job from another business', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version, job_id) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','x','{}','v','f2000000-0000-0000-0000-000000000002')$$);
select pg_temp.expect_fail('cannot link a product from another business', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version, product_id) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','x','{}','v','e2000000-0000-0000-0000-000000000002')$$);
select pg_temp.expect_fail('cannot link a stranger''s customer', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version, customer_id) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','x','{}','v','cb000000-0000-0000-0000-000000000003')$$);
select pg_temp.expect_fail('cannot re-link by update to another business''s job', $$update public.saved_calculations set job_id='f2000000-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('cannot move a record to another business', $$update public.saved_calculations set business_id='a2000000-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('cannot change user_id', $$update public.saved_calculations set user_id='bbbbbbbb-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('cannot change calculator_id', $$update public.saved_calculations set calculator_id='loan'$$);
select pg_temp.expect_fail('cannot choose own id', $$insert into public.saved_calculations (id, business_id, user_id, calculator_id, title, inputs, engine_version) values (gen_random_uuid(),'a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','x','{}','v')$$);
select pg_temp.expect_fail('cannot add a result column value (column does not exist)', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version, result) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','x','{}','v','{}')$$);
select pg_temp.expect_fail('empty title rejected', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','  ','{}','v')$$);
select pg_temp.expect_fail('inputs must be a JSON object', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','x','[1,2]','v')$$);
select pg_temp.expect_fail('oversized inputs rejected', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','profit','x',jsonb_build_object('k', repeat('x', 40000)),'v')$$);
select pg_temp.expect_fail('malformed calculator id rejected', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Profit; drop table x','x','{}','v')$$);
insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','business-expenses', E'Ọlá & Sons <script>alert(1)</script> ''q''', '{"items":[{"name":"Rent <b>","amount":"50,000"}]}', 'v');
select pg_temp.expect_eq('special characters and nested inputs stored as plain data', (select count(*)::int from public.saved_calculations where title like '%<script>%' and inputs->'items'->0->>'name' = 'Rent <b>'), 1);
reset role;

-- ===== bob (IDOR) =====
set role authenticated; set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect_eq('bob sees none of alice''s saved calculations', (select count(*)::int from public.saved_calculations), 0);
with u as (update public.saved_calculations set title='pwned' returning 1) select pg_temp.expect_eq('bob cannot update alice''s calculations (0 rows)', (select count(*)::int from u), 0);
with d as (delete from public.saved_calculations returning 1) select pg_temp.expect_eq('bob cannot delete alice''s calculations (0 rows)', (select count(*)::int from d), 0);
select pg_temp.expect_fail('bob cannot attach a calculation to alice''s business', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('a1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','profit','x','{}','v')$$);
reset role;
select pg_temp.expect_eq('alice''s calculations intact after bob''s attempts', (select count(*)::int from public.saved_calculations where user_id='aaaaaaaa-0000-0000-0000-000000000001'), 3);

-- ===== dan (free): cannot save or edit; CAN read and delete own data =====
set role authenticated; set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
select pg_temp.expect_fail('FREE user cannot save a calculation', $$insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','profit','x','{}','v')$$);
reset role;
insert into public.saved_calculations (business_id, user_id, calculator_id, title, inputs, engine_version) values ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','profit','Saved while premium','{"cost":"1","sell":"2"}','v');   -- trusted setup
set role authenticated; set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
select pg_temp.expect_eq('free/lapsed user can still READ own calculations', (select count(*)::int from public.saved_calculations), 1);
with u as (update public.saved_calculations set title='edit' returning 1) select pg_temp.expect_eq('free/lapsed user cannot edit (0 rows)', (select count(*)::int from u), 0);
with d as (delete from public.saved_calculations returning 1) select pg_temp.expect_eq('free/lapsed user CAN delete own data', (select count(*)::int from d), 1);
reset role;

-- ===== anon and admin =====
set role anon; reset request.jwt.claim.sub;
select pg_temp.expect_fail('anon cannot read saved calculations', $$select count(*) from public.saved_calculations$$);
reset role;
set role authenticated; set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select pg_temp.expect_eq('admin CANNOT see saved calculations', (select count(*)::int from public.saved_calculations), 0);
reset role;

-- ===== owner delete and lifecycle =====
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.saved_calculations where title like '%(copy)';
select pg_temp.expect_eq('premium owner can delete a calculation', (select count(*)::int from public.saved_calculations where title like '%(copy)'), 0);
reset role;
delete from public.customers where id='c1000000-0000-0000-0000-000000000001';
select pg_temp.expect_eq('deleting a linked customer clears only the link (calculation survives)', (select count(*)::int from public.saved_calculations where title='Ankara margin v2' and customer_id is null and business_id='a1000000-0000-0000-0000-000000000001'), 1);
delete from auth.users where id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_eq('deleting a user removes their saved calculations', (select count(*)::int from public.saved_calculations where user_id='aaaaaaaa-0000-0000-0000-000000000001'), 0);

\o
\echo
select 'TOTAL ' || count(*) || '  PASSED ' || count(*) filter (where ok) || '  FAILED ' || count(*) filter (where not ok) as summary from results;
select name as failed_check from results where not ok;
