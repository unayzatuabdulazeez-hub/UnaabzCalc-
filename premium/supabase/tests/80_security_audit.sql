-- Security audit of the whole schema (run after every migration). It checks the SHAPE of the permissions, so a future migration that
-- forgets a lock fails here even if no feature test notices.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
create temp table results (name text, ok boolean);
grant all on results to public;
create function pg_temp.expect_eq(name text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is not distinct from want then insert into results values (name, true); raise notice 'PASS  %', name;
  else insert into results values (name, false); raise notice 'FAIL  %  (got %, wanted %)', name, got, want; end if;
end $$;
create function pg_temp.expect_fail(name text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; insert into results values (name, false); raise notice 'FAIL  %  (statement unexpectedly succeeded)', name;
  exception when others then insert into results values (name, true); raise notice 'PASS  %', name; end;
end $$;

-- ===== 1. Row-level security is on for every table in the public schema =====
select pg_temp.expect_eq('every public table has row-level security enabled',
  (select coalesce(string_agg(c.relname, ','), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '');
select pg_temp.expect_eq('no public view exists (views bypass row-level security unless made carefully)',
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm')), 0);
select pg_temp.expect_eq('no public sequence is readable by users',
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S' and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('authenticated', c.oid, 'usage'))), 0);

-- ===== 2. What anonymous visitors can touch =====
select pg_temp.expect_eq('anon can read ONLY app_settings (the public price) and nothing else',
  (select coalesce(string_agg(c.relname, ',' order by c.relname), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))), 'app_settings');
select pg_temp.expect_eq('anon has no write privilege on app_settings',
  has_table_privilege('anon', 'public.app_settings', 'insert') or has_table_privilege('anon', 'public.app_settings', 'update') or has_table_privilege('anon', 'public.app_settings', 'delete'), false);
select pg_temp.expect_eq('anon can execute NO function in the public schema',
  (select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), '');
select pg_temp.expect_eq('PUBLIC (everyone) can execute NO function in the public schema',
  (select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('public', p.oid, 'execute')), '');

-- ===== 3. Signed-in users: tables that only trusted code may write =====
select pg_temp.expect_eq('signed-in users cannot insert, update or delete entitlements, payments, webhook events, the audit log, admin list or settings',
  (select coalesce(string_agg(t, ','), '') from unnest(array['entitlements','payments','webhook_events','audit_log','admin_users','app_settings']) t
    where has_table_privilege('authenticated', 'public.' || t, 'insert') or has_table_privilege('authenticated', 'public.' || t, 'update') or has_table_privilege('authenticated', 'public.' || t, 'delete') or has_table_privilege('authenticated', 'public.' || t, 'truncate')), '');
select pg_temp.expect_eq('signed-in users cannot even read webhook events',
  has_table_privilege('authenticated', 'public.webhook_events', 'select'), false);
select pg_temp.expect_eq('nobody but the owner role can truncate or reference any table (users and anon)',
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('authenticated', c.oid, 'truncate') or has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('authenticated', c.oid, 'trigger') or has_table_privilege('anon', c.oid, 'trigger'))), 0);

-- ===== 4. Which functions a signed-in user may call (exact list; a new one must be added here on purpose) =====
select pg_temp.expect_eq('functions executable by signed-in users are exactly the expected ones',
  (select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')),
  'admin_end_paid_access,admin_grant_complimentary,admin_list_payments,admin_list_users,admin_list_webhooks,admin_revoke_complimentary,admin_set_premium_price,admin_stats,admin_user_detail,has_premium,is_admin');
select pg_temp.expect_eq('payment-recording functions are executable by the service role only',
  (select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute')::text || '/' || has_function_privilege('service_role', p.oid, 'execute')::text, ',' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('apply_paystack_charge','apply_paystack_subscription_event','create_checkout_payment','claim_webhook_event','finish_webhook_event')),
  'apply_paystack_charge:false/true,apply_paystack_subscription_event:false/true,claim_webhook_event:false/true,create_checkout_payment:false/true,finish_webhook_event:false/true');

-- ===== 5. Every SECURITY DEFINER function pins its search_path (otherwise a user could shadow a table or function) =====
select pg_temp.expect_eq('every security-definer function sets search_path to empty',
  (select coalesce(string_agg(p.proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c = 'search_path=""')), '');
select pg_temp.expect_eq('every function that runs as its owner is a function we wrote (none came from a stray extension)',
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and p.proowner <> (select oid from pg_roles where rolname = current_user)), 0);

-- ===== 6. Policies: each table policy names its role; nothing is open to anon except the price =====
select pg_temp.expect_eq('the only policy that applies to anon is the public price read',
  (select coalesce(string_agg(policyname, ','), '') from pg_policies where schemaname = 'public' and ('anon' = any (roles) or 'public' = any (roles))), 'app_settings_public_read');
select pg_temp.expect_eq('no policy is unconditional (using true) except none',
  (select count(*)::int from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')), 0);
select pg_temp.expect_eq('every business-owned table has an owner-only policy (policies mention auth.uid)',
  (select coalesce(string_agg(t, ','), '') from unnest(array['businesses','customers','jobs','products','saved_calculations','profiles','entitlements','payments']) t
    where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t and (coalesce(p.qual, '') like '%auth.uid%' or coalesce(p.with_check, '') like '%auth.uid%'))), '');
select pg_temp.expect_eq('admins get no policy on customers, jobs, products or saved calculations',
  (select coalesce(string_agg(tablename || ':' || policyname, ','), '') from pg_policies where schemaname = 'public' and tablename in ('customers','jobs','products','saved_calculations','businesses') and (coalesce(qual, '') like '%is_admin%' or coalesce(with_check, '') like '%is_admin%')), '');

-- ===== 7. The audit log and the owner columns cannot be altered =====
insert into auth.users (id, email) values ('99999999-0000-0000-0000-000000000001', 'owner@example.test');
insert into public.admin_users (user_id, role) values ('99999999-0000-0000-0000-000000000001', 'owner');
insert into public.audit_log (actor_id, action, target_table, target_id) values (null, 'audit_probe', 't', '1');
select pg_temp.expect_fail('the audit log cannot be updated, even by the table owner', $$update public.audit_log set action = 'tampered'$$);
select pg_temp.expect_fail('the audit log cannot be deleted from, even by the table owner', $$delete from public.audit_log$$);
set role service_role;
select pg_temp.expect_fail('the audit log cannot be updated by the service role either', $$update public.audit_log set action = 'tampered'$$);
reset role;
set role authenticated; set request.jwt.claim.sub = '99999999-0000-0000-0000-000000000001';
select pg_temp.expect_fail('even an owner-admin cannot edit the admin list through the API', $$insert into public.admin_users (user_id) values ('99999999-0000-0000-0000-000000000001')$$);
select pg_temp.expect_fail('even an owner-admin cannot change their own plan through the API', $$update public.entitlements set status = 'premium' where user_id = '99999999-0000-0000-0000-000000000001'$$);
select pg_temp.expect_fail('even an owner-admin cannot write payments through the API', $$insert into public.payments (user_id, reference, kind, status) values ('99999999-0000-0000-0000-000000000001', 'UC-hack-0000-0001', 'checkout', 'success')$$);
select pg_temp.expect_fail('even an owner-admin cannot change the price directly', $$update public.app_settings set value = '{"amount_kobo": 1000000, "currency": "NGN", "interval": "monthly"}'$$);
reset role;
\o
\echo
select 'TOTAL ' || count(*) || '  PASSED ' || count(*) filter (where ok) || '  FAILED ' || count(*) filter (where not ok) as summary from results;
select name as failed_check from results where not ok;
