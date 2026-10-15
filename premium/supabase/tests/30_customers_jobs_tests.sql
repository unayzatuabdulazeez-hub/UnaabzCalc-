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

-- users: alice (premium), bob (premium), dan (free), erin (lapsed premium), carol (admin)
insert into auth.users (id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','alice@example.test'),
 ('bbbbbbbb-0000-0000-0000-000000000002','bob@example.test'),
 ('dddddddd-0000-0000-0000-000000000004','dan@example.test'),
 ('eeeeeeee-0000-0000-0000-000000000005','erin@example.test'),
 ('cccccccc-0000-0000-0000-000000000003','carol@example.test');
insert into public.admin_users (user_id, role) values ('cccccccc-0000-0000-0000-000000000003','owner');
-- trusted server grants premium to alice, bob; erin is premium now, lapses later
update public.entitlements set status='complimentary' where user_id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','eeeeeeee-0000-0000-0000-000000000005');
insert into public.businesses (id, owner_id, name) values
 ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Alice Fabrics'),
 ('a2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Alice Farm'),
 ('b1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','Bob Tailoring'),
 ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','Dan Shop'),
 ('e1000000-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000005','Erin Shop');

-- fixtures with fixed ids are inserted by the trusted server role (users cannot choose row ids)
insert into public.customers (id, business_id, user_id, name, phone) values ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Mama Ngozi','08031234567');
insert into public.customers (id, business_id, user_id, name) values ('c2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','Farm Buyer');
insert into public.jobs (id, business_id, user_id, customer_id, title, agreed_amount, due_date) values ('f1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Wedding aso-ebi',150000.50,current_date+7);

-- ===== alice (premium) =====
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_eq('premium user has_premium() is true', public.has_premium(), true);
insert into public.customers (business_id, user_id, name, phone) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Chidi Stores','08099990000');
select pg_temp.expect_eq('premium user can add a customer to own business', (select count(*)::int from public.customers where name='Chidi Stores'), 1);
insert into public.jobs (business_id, user_id, customer_id, title, agreed_amount) select 'a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001', id, 'Chidi order', 25000 from public.customers where name='Chidi Stores';
select pg_temp.expect_eq('premium user can add a job linked to a customer', (select count(*)::int from public.jobs where title='Chidi order' and customer_id is not null), 1);
select pg_temp.expect_eq('fixtures plus new job are visible to owner', (select count(*)::int from public.jobs), 2);
select pg_temp.expect_eq('new job defaults to quote', (select status::text from public.jobs where title='Chidi order'), 'quote');
insert into public.jobs (business_id, user_id, title) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Walk-in order, no customer');
select pg_temp.expect_eq('a job without a customer is allowed', (select count(*)::int from public.jobs where customer_id is null), 1);
update public.jobs set status='in_progress' where id='f1000000-0000-0000-0000-000000000001';
select pg_temp.expect_eq('job status can change', (select status::text from public.jobs where id='f1000000-0000-0000-0000-000000000001'), 'in_progress');
update public.customers set archived_at=now() where id='c2000000-0000-0000-0000-000000000002';
select pg_temp.expect_eq('customer can be archived', (select count(*)::int from public.customers where archived_at is not null), 1);

select pg_temp.expect_fail('job cannot use a customer from another of the SAME user''s businesses',
  $$insert into public.jobs (business_id, user_id, customer_id, title) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000002','Cross-business')$$);
select pg_temp.expect_fail('moving a job to another customer in a different business is blocked',
  $$update public.jobs set customer_id='c2000000-0000-0000-0000-000000000002' where id='f1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_fail('cannot create a customer in someone else''s business',
  $$insert into public.customers (business_id, user_id, name) values ('b1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Sneaky')$$);
select pg_temp.expect_fail('cannot forge user_id to write into someone else''s business',
  $$insert into public.customers (business_id, user_id, name) values ('b1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','Forged')$$);
select pg_temp.expect_fail('cannot attach a job to someone else''s business',
  $$insert into public.jobs (business_id, user_id, title) values ('b1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Sneaky job')$$);
select pg_temp.expect_fail('cannot move a customer to another business (business_id immutable)',
  $$update public.customers set business_id='a2000000-0000-0000-0000-000000000002' where id='c1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_fail('cannot change user_id on a customer',
  $$update public.customers set user_id='bbbbbbbb-0000-0000-0000-000000000002' where id='c1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_fail('cannot change user_id on a job',
  $$update public.jobs set user_id='bbbbbbbb-0000-0000-0000-000000000002' where id='f1000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_fail('users cannot choose their own customer id', $$insert into public.customers (id, business_id, user_id, name) values (gen_random_uuid(),'a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','X')$$);
select pg_temp.expect_fail('customers cannot be deleted (archive only)', $$delete from public.customers$$);
select pg_temp.expect_fail('jobs cannot be deleted (archive only)', $$delete from public.jobs$$);
select pg_temp.expect_fail('negative job amount rejected', $$insert into public.jobs (business_id, user_id, title, agreed_amount) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Neg',-1)$$);
select pg_temp.expect_fail('absurd job amount rejected', $$insert into public.jobs (business_id, user_id, title, agreed_amount) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Huge',1e12)$$);
select pg_temp.expect_fail('blank customer name rejected', $$insert into public.customers (business_id, user_id, name) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','  ')$$);
select pg_temp.expect_fail('over-long job title rejected', $$insert into public.jobs (business_id, user_id, title) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',repeat('x',161))$$);
select pg_temp.expect_fail('invalid job status rejected', $$insert into public.jobs (business_id, user_id, title, status) values ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','S','won')$$);
select pg_temp.expect_fail('users cannot change the price setting',
  $$update public.app_settings set value='{"amount_kobo":100,"currency":"NGN","interval":"monthly"}'$$);
select pg_temp.expect_fail('users cannot call the admin price function', $$select public.admin_set_premium_price(299900,'self')$$);
reset role;

-- ===== bob: isolation =====
set role authenticated; set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect_eq('bob sees none of alice''s customers', (select count(*)::int from public.customers), 0);
select pg_temp.expect_eq('bob sees none of alice''s jobs', (select count(*)::int from public.jobs), 0);
select pg_temp.expect_eq('bob cannot fetch alice''s customer by id', (select count(*)::int from public.customers where id='c1000000-0000-0000-0000-000000000001'), 0);
with u as (update public.customers set name='pwned' where id='c1000000-0000-0000-0000-000000000001' returning 1)
select pg_temp.expect_eq('bob cannot update alice''s customer (0 rows)', (select count(*)::int from u), 0);
with u as (update public.jobs set status='cancelled' where id='f1000000-0000-0000-0000-000000000001' returning 1)
select pg_temp.expect_eq('bob cannot update alice''s job (0 rows)', (select count(*)::int from u), 0);
select pg_temp.expect_fail('bob cannot link his job to alice''s customer id',
  $$insert into public.jobs (business_id, user_id, customer_id, title) values ('b1000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','Cross-user')$$);
reset role;
select pg_temp.expect_eq('alice''s customer unchanged after bob''s attempts', (select name from public.customers where id='c1000000-0000-0000-0000-000000000001'), 'Mama Ngozi');

-- ===== dan (free plan): cannot write, even directly through the API =====
set role authenticated; set request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
select pg_temp.expect_eq('free user has_premium() is false', public.has_premium(), false);
select pg_temp.expect_fail('FREE user cannot insert a customer (database-enforced)',
  $$insert into public.customers (business_id, user_id, name) values ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','Nope')$$);
select pg_temp.expect_fail('FREE user cannot insert a job (database-enforced)',
  $$insert into public.jobs (business_id, user_id, title) values ('d1000000-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000004','Nope')$$);
select pg_temp.expect_fail('FREE user cannot give themselves Premium', $$update public.entitlements set status='premium', payment_status='paid', subscription_end=now()+interval '30 days'$$);
reset role;

-- ===== erin: premium lapses, data stays readable but frozen =====
set role authenticated; set request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000005';
insert into public.customers (business_id, user_id, name) values ('e1000000-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000005','Erin Customer');
reset role;
update public.entitlements set status='expired' where user_id='eeeeeeee-0000-0000-0000-000000000005';
set role authenticated; set request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000005';
select pg_temp.expect_eq('lapsed user can still READ own data', (select count(*)::int from public.customers), 1);
select pg_temp.expect_fail('lapsed user cannot add new customers', $$insert into public.customers (business_id, user_id, name) values ('e1000000-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000005','New')$$);
with u as (update public.customers set name='edited' returning 1)
select pg_temp.expect_eq('lapsed user cannot edit existing customers (0 rows)', (select count(*)::int from u), 0);
reset role;

-- ===== anonymous =====
set role anon; reset request.jwt.claim.sub;
select pg_temp.expect_fail('anon cannot read customers', $$select count(*) from public.customers$$);
select pg_temp.expect_fail('anon cannot read jobs', $$select count(*) from public.jobs$$);
select pg_temp.expect_eq('anon CAN read the public price', (select (value->>'amount_kobo')::int from public.app_settings where key='premium_price'), 499900);
select pg_temp.expect_fail('anon cannot change the price', $$update public.app_settings set value='{}'$$);
reset role;

-- ===== admin =====
set role authenticated; set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select pg_temp.expect_eq('admin cannot see customers', (select count(*)::int from public.customers), 0);
select pg_temp.expect_eq('admin cannot see jobs', (select count(*)::int from public.jobs), 0);
select pg_temp.expect_eq('launch price is NGN 4,999 per month (499900 kobo)', (select value from public.app_settings where key='premium_price'), '{"amount_kobo": 499900, "currency": "NGN", "interval": "monthly"}'::jsonb);
select pg_temp.expect_fail('price change needs a reason', $$select public.admin_set_premium_price(599900,' ')$$);
select pg_temp.expect_fail('price below NGN 100 rejected', $$select public.admin_set_premium_price(9999,'typo')$$);
select pg_temp.expect_fail('price above NGN 1,000,000 rejected', $$select public.admin_set_premium_price(100000001,'typo')$$);
select pg_temp.expect_fail('admin cannot write app_settings directly', $$update public.app_settings set value='{}'$$);
select public.admin_set_premium_price(599900,'Test price change');
select pg_temp.expect_eq('admin can change the price', (select (value->>'amount_kobo')::int from public.app_settings), 599900);
select pg_temp.expect_eq('price change is audited with previous value', (select (details->'previous'->>'amount_kobo')::int from public.audit_log where action='set_premium_price'), 499900);
reset role;

-- ===== lifecycle =====
delete from auth.users where id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_eq('deleting a user removes their customers and jobs',
  (select (select count(*) from public.customers where user_id='aaaaaaaa-0000-0000-0000-000000000001') + (select count(*) from public.jobs where user_id='aaaaaaaa-0000-0000-0000-000000000001'))::int, 0);
select pg_temp.expect_eq('other users'' data is untouched by that deletion', (select count(*)::int from public.customers where user_id='eeeeeeee-0000-0000-0000-000000000005'), 1);

\o
\echo
select 'TOTAL ' || count(*) || '  PASSED ' || count(*) filter (where ok) || '  FAILED ' || count(*) filter (where not ok) as summary from results;
select name as failed_check from results where not ok;
