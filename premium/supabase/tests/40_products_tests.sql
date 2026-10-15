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

-- alice, bob = premium (complimentary); dan = free; carol = admin
insert into auth.users (id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','alice@example.test'),
 ('bbbbbbbb-0000-0000-0000-000000000002','bob@example.test'),
 ('dddddddd-0000-0000-0000-000000000004','dan@example.test'),
 ('cccccccc-0000-0000-0000-000000000003','carol@example.test');
insert into public.admin_users (user_id, role) values ('cccccccc-0000-0000-0000-000000000003','owner');
update public.entitlements set status='complimentary' where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');
insert into public.businesses (id, owner_id, name) values
 ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Alice Fabrics'),
 ('b1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','Bob Electric'),
 ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','Dan Stores');

-- ===== alice (premium) =====
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.products (business_id, user_id, name, unit, cost_price, selling_price) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Ankara 6 yards','piece',8000,12000.50);
select pg_temp.expect_eq('premium owner can add a product', (select count(*)::int from public.products), 1);
select pg_temp.expect_eq('decimals stored exactly', (select selling_price from public.products), 12000.50::numeric);
update public.products set selling_price = 13000 where name='Ankara 6 yards';
select pg_temp.expect_eq('premium owner can edit a product', (select selling_price from public.products), 13000::numeric);
update public.products set archived_at = now();
select pg_temp.expect_eq('premium owner can archive a product', (select count(*)::int from public.products where archived_at is not null), 1);
select pg_temp.expect_fail('cannot add a product to someone else''s business', $$insert into public.products (business_id, user_id, name) values ('b1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Sneaky')$$);
select pg_temp.expect_fail('cannot add a product to own business as another user', $$insert into public.products (business_id, user_id, name) values ('a1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','Spoof')$$);
select pg_temp.expect_fail('cannot change business_id', $$update public.products set business_id='b1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_fail('cannot change user_id', $$update public.products set user_id='bbbbbbbb-0000-0000-0000-000000000002'$$);
select pg_temp.expect_fail('cannot choose own id', $$insert into public.products (id, business_id, user_id, name) values (gen_random_uuid(),'a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','X')$$);
select pg_temp.expect_fail('products cannot be deleted (archive only)', $$delete from public.products$$);
select pg_temp.expect_fail('empty name rejected', $$insert into public.products (business_id, user_id, name) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','  ')$$);
select pg_temp.expect_fail('negative cost rejected', $$insert into public.products (business_id, user_id, name, cost_price) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Bad',-5)$$);
select pg_temp.expect_fail('absurd selling price rejected', $$insert into public.products (business_id, user_id, name, selling_price) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Huge',1e13)$$);
insert into public.products (business_id, user_id, name, notes) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001', E'Ọlá & Sons <b>''x''</b>', 'ok');
select pg_temp.expect_eq('special characters stored as plain data', (select count(*)::int from public.products where name like '%<b>%'), 1);
reset role;

-- ===== bob: IDOR =====
set role authenticated; set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect_eq('bob sees none of alice''s products', (select count(*)::int from public.products), 0);
with u as (update public.products set name='pwned' returning 1) select pg_temp.expect_eq('bob cannot update alice''s products (0 rows)', (select count(*)::int from u), 0);
reset role;
select pg_temp.expect_eq('alice''s products unchanged', (select count(*)::int from public.products where name='pwned'), 0);

-- ===== dan (free): can read, cannot write =====
set role authenticated; set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
select pg_temp.expect_fail('FREE user cannot add a product', $$insert into public.products (business_id, user_id, name) values ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','Nope')$$);
reset role;
insert into public.products (business_id, user_id, name) values ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','Seeded while premium earlier');  -- trusted setup
set role authenticated; set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
select pg_temp.expect_eq('free/lapsed user can still READ own products', (select count(*)::int from public.products), 1);
with u as (update public.products set name='edit' returning 1) select pg_temp.expect_eq('free/lapsed user cannot edit (0 rows)', (select count(*)::int from u), 0);
reset role;

-- ===== anon and admin =====
set role anon; reset request.jwt.claim.sub;
select pg_temp.expect_fail('anon cannot read products', $$select count(*) from public.products$$);
reset role;
set role authenticated; set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select pg_temp.expect_eq('admin CANNOT see products', (select count(*)::int from public.products), 0);
reset role;

-- ===== lifecycle =====
delete from auth.users where id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_eq('deleting a user removes their products', (select count(*)::int from public.products where user_id='aaaaaaaa-0000-0000-0000-000000000001'), 0);

\o
\echo
select 'TOTAL ' || count(*) || '  PASSED ' || count(*) filter (where ok) || '  FAILED ' || count(*) filter (where not ok) as summary from results;
select name as failed_check from results where not ok;
