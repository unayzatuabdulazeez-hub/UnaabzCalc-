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

-- users: alice, bob, carol (admin)
insert into auth.users (id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','alice@example.test'),
 ('bbbbbbbb-0000-0000-0000-000000000002','bob@example.test'),
 ('cccccccc-0000-0000-0000-000000000003','carol@example.test');
insert into public.admin_users (user_id, role) values ('cccccccc-0000-0000-0000-000000000003','owner');

select pg_temp.expect_eq('signup creates a profile for each user', (select count(*)::int from public.profiles), 3);
select pg_temp.expect_eq('signup creates a FREE entitlement (no trial at launch)',
  (select count(*)::int from public.entitlements where status='free' and trial_start is null and trial_end is null), 3);

-- ===== alice =====
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.businesses (owner_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001','Alice Fabrics');
insert into public.businesses (owner_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001','Alice Farm');
select pg_temp.expect_eq('user can own several businesses', (select count(*)::int from public.businesses), 2);
select pg_temp.expect_eq('user sees only own profile', (select count(*)::int from public.profiles), 1);
select pg_temp.expect_eq('user sees only own entitlement', (select count(*)::int from public.entitlements), 1);
select pg_temp.expect_fail('user cannot create a business owned by someone else',
  $$insert into public.businesses (owner_id, name) values ('bbbbbbbb-0000-0000-0000-000000000002','Hijack')$$);
select pg_temp.expect_fail('user cannot upgrade own entitlement to premium',
  $$update public.entitlements set status='premium' where user_id='aaaaaaaa-0000-0000-0000-000000000001'$$);
select pg_temp.expect_fail('user cannot insert an entitlement row',
  $$insert into public.entitlements (user_id, status) values ('aaaaaaaa-0000-0000-0000-000000000001','premium')$$);
select pg_temp.expect_fail('user cannot delete own entitlement',
  $$delete from public.entitlements where user_id='aaaaaaaa-0000-0000-0000-000000000001'$$);
select pg_temp.expect_fail('user cannot make themselves admin',
  $$insert into public.admin_users (user_id, role) values ('aaaaaaaa-0000-0000-0000-000000000001','owner')$$);
select pg_temp.expect_eq('audit log shows 0 rows to non-admin', (select count(*)::int from public.audit_log), 0);
select pg_temp.expect_fail('user cannot write the audit log',
  $$insert into public.audit_log (action, target_table, target_id) values ('x','y','z')$$);
select pg_temp.expect_fail('user cannot call admin grant function',
  $$select public.admin_grant_complimentary('aaaaaaaa-0000-0000-0000-000000000001', now() + interval '1 day', 'self-grant')$$);
select pg_temp.expect_fail('user cannot change profile email', 
  $$update public.profiles set email='x@evil.test' where id='aaaaaaaa-0000-0000-0000-000000000001'$$);
update public.profiles set full_name='Alice A.' where id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_eq('user can edit own full_name', (select full_name from public.profiles), 'Alice A.');
select pg_temp.expect_fail('user cannot change business owner (reassign)',
  $$update public.businesses set owner_id='bbbbbbbb-0000-0000-0000-000000000002' where name='Alice Farm'$$);
select pg_temp.expect_fail('user cannot delete a business (archive only in Phase 1)',
  $$delete from public.businesses where name='Alice Farm'$$);
update public.businesses set archived_at = now() where name='Alice Farm';
select pg_temp.expect_eq('user can archive own business', (select count(*)::int from public.businesses where archived_at is not null), 1);
select pg_temp.expect_fail('empty business name rejected', $$insert into public.businesses (owner_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001','   ')$$);
select pg_temp.expect_fail('invalid currency rejected', $$insert into public.businesses (owner_id, name, currency) values ('aaaaaaaa-0000-0000-0000-000000000001','X','naira')$$);
select pg_temp.expect_fail('user cannot set own id/created_at on business',
  $$insert into public.businesses (id, owner_id, name) values (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Y')$$);
reset role;

-- ===== bob (IDOR attempts against alice's rows) =====
set role authenticated; set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect_eq('bob sees none of alice''s businesses', (select count(*)::int from public.businesses), 0);
select pg_temp.expect_eq('bob cannot read alice by id (businesses)', (select count(*)::int from public.businesses where owner_id='aaaaaaaa-0000-0000-0000-000000000001'), 0);
select pg_temp.expect_eq('bob cannot read alice profile', (select count(*)::int from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000001'), 0);
select pg_temp.expect_eq('bob cannot read alice entitlement', (select count(*)::int from public.entitlements where user_id='aaaaaaaa-0000-0000-0000-000000000001'), 0);
with u as (update public.businesses set name='pwned' where owner_id='aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select pg_temp.expect_eq('bob cannot update alice''s business (0 rows)', (select count(*)::int from u), 0);
reset role;
select pg_temp.expect_eq('alice''s business unchanged after bob''s attempt', (select count(*)::int from public.businesses where name='pwned'), 0);

-- ===== anonymous =====
set role anon; reset request.jwt.claim.sub;
select pg_temp.expect_fail('anon cannot read businesses', $$select count(*) from public.businesses$$);
select pg_temp.expect_fail('anon cannot read entitlements', $$select count(*) from public.entitlements$$);
select pg_temp.expect_fail('anon cannot read profiles', $$select count(*) from public.profiles$$);
select pg_temp.expect_fail('anon cannot call is_admin', $$select public.is_admin()$$);
reset role;

-- ===== carol (admin) =====
set role authenticated; set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select pg_temp.expect_eq('admin is recognised', public.is_admin(), true);
select pg_temp.expect_eq('admin can see all profiles', (select count(*)::int from public.profiles), 3);
select pg_temp.expect_eq('admin can see all entitlements', (select count(*)::int from public.entitlements), 3);
select pg_temp.expect_eq('admin CANNOT see user businesses (data minimisation)', (select count(*)::int from public.businesses), 0);
select pg_temp.expect_fail('admin cannot write entitlements directly',
  $$update public.entitlements set status='premium' where user_id='aaaaaaaa-0000-0000-0000-000000000001'$$);
select pg_temp.expect_fail('admin cannot add another admin through the API',
  $$insert into public.admin_users (user_id) values ('bbbbbbbb-0000-0000-0000-000000000002')$$);
select pg_temp.expect_fail('grant requires a reason', $$select public.admin_grant_complimentary('aaaaaaaa-0000-0000-0000-000000000001', now() + interval '30 days', '  ')$$);
select pg_temp.expect_fail('grant end date must be in the future', $$select public.admin_grant_complimentary('aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 day', 'x')$$);
select pg_temp.expect_fail('grant to unknown user fails', $$select public.admin_grant_complimentary('dddddddd-0000-0000-0000-000000000009', now() + interval '1 day', 'x')$$);
select public.admin_grant_complimentary('aaaaaaaa-0000-0000-0000-000000000001', now() + interval '30 days', 'Launch partner');
select pg_temp.expect_eq('admin grant sets complimentary', (select status::text from public.entitlements where user_id='aaaaaaaa-0000-0000-0000-000000000001'), 'complimentary');
select pg_temp.expect_eq('admin grant writes an audit row', (select count(*)::int from public.audit_log where action='grant_complimentary'), 1);
select pg_temp.expect_eq('audit row records actor', (select actor_id::text from public.audit_log limit 1), 'cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_fail('revoke only works on complimentary', $$select public.admin_revoke_complimentary('bbbbbbbb-0000-0000-0000-000000000002','x')$$);
select public.admin_revoke_complimentary('aaaaaaaa-0000-0000-0000-000000000001','Partnership ended');
select pg_temp.expect_eq('admin revoke sets expired', (select status::text from public.entitlements where user_id='aaaaaaaa-0000-0000-0000-000000000001'), 'expired');
select pg_temp.expect_eq('two audit rows now', (select count(*)::int from public.audit_log), 2);
select pg_temp.expect_fail('audit log cannot be edited', $$update public.audit_log set action='tampered'$$);
select pg_temp.expect_fail('audit log cannot be deleted', $$delete from public.audit_log$$);
reset role;

-- paid users are protected from complimentary overwrite
update public.entitlements set status='premium', payment_status='paid' where user_id='bbbbbbbb-0000-0000-0000-000000000002';  -- done as DB owner = trusted server
set role authenticated; set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select pg_temp.expect_fail('admin cannot overwrite a paid premium user with complimentary',
  $$select public.admin_grant_complimentary('bbbbbbbb-0000-0000-0000-000000000002', now() + interval '1 day', 'x')$$);
reset role;

-- ===== trusted server path & lifecycle =====
set role service_role;
update public.entitlements set status='premium', payment_status='paid', subscription_start=now(), subscription_end=now()+interval '30 days'
 where user_id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_eq('service role (trusted server) CAN set entitlement', (select status::text from public.entitlements where user_id='aaaaaaaa-0000-0000-0000-000000000001'), 'premium');
select pg_temp.expect_fail('date order constraint enforced', $$update public.entitlements set subscription_end = subscription_start - interval '1 day' where user_id='aaaaaaaa-0000-0000-0000-000000000001'$$);
reset role;
delete from auth.users where id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_eq('deleting a user cascades profile, entitlement, businesses',
  (select (select count(*) from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000001') + (select count(*) from public.entitlements where user_id='aaaaaaaa-0000-0000-0000-000000000001') + (select count(*) from public.businesses where owner_id='aaaaaaaa-0000-0000-0000-000000000001'))::int, 0);
select pg_temp.expect_eq('audit history survives user deletion', (select count(*)::int from public.audit_log), 2);

\o
\echo
select 'TOTAL ' || count(*) || '  PASSED ' || count(*) filter (where ok) || '  FAILED ' || count(*) filter (where not ok) as summary from results;
select name as failed_check from results where not ok;
