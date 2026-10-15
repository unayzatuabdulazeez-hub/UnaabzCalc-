-- UnaabzCalc Premium V1 / Migration 0006: admin screens (read-only views, plus ending paid access after a manual refund).
-- Requires 0001 to 0005. Back up before running on production.
--
-- Rules:
--   * Every function below re-checks public.is_admin() itself (security definer) and raises 42501 for anyone else, anon included.
--   * They return ONLY account, plan, payment and webhook data. Admins get no access to customers, jobs, products, businesses or saved calculations.
--   * Reading one person's detail is written to the audit log. Search text is escaped, filters are checked against a fixed list, page sizes are capped.

-- ---------- 1. One definition of "has Premium right now", usable for any user ----------
-- has_premium() (used by every row-level-security policy) now delegates to it, so the admin screens and the policies can never disagree.
-- The generated parity test (686 cases) still checks has_premium() against the TypeScript rules.
create function public.premium_active_for(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case e.status
      when 'free' then false
      when 'expired' then false
      when 'trial' then e.trial_end is not null
                        and (e.trial_start is null or e.trial_start <= now())
                        and e.trial_end > now()
      when 'premium' then e.payment_status = 'paid'
                        and e.subscription_end is not null
                        and (e.subscription_start is null or e.subscription_start <= now())
                        and e.subscription_end > now()
      when 'founding_member' then (e.subscription_start is null or e.subscription_start <= now())
                        and (e.subscription_end is null or e.subscription_end > now())
      when 'complimentary' then (e.subscription_start is null or e.subscription_start <= now())
                        and (e.subscription_end is null or e.subscription_end > now())
      when 'cancelled' then e.subscription_end is not null
                        and (e.subscription_start is null or e.subscription_start <= now())
                        and e.subscription_end > now()
      else false
    end
    from public.entitlements e
    where e.user_id = p_user
  ), false);
$$;
revoke all on function public.premium_active_for(uuid) from public, anon, authenticated;

create or replace function public.has_premium() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.premium_active_for((select auth.uid()));
$$;

-- ---------- helpers ----------
create function public.admin_require() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'not authorized' using errcode = '42501'; end if;
end $$;
revoke all on function public.admin_require() from public, anon, authenticated;

create function public.admin_like(p_text text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(btrim(left(coalesce(p_text, ''), 100)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;
revoke all on function public.admin_like(text) from public, anon, authenticated;

-- ---------- 2. Users ----------
create function public.admin_list_users(p_search text default null, p_filter text default 'all', p_limit integer default 25, p_offset integer default 0)
returns table (user_id uuid, email text, full_name text, signed_up timestamptz, status text, premium_now boolean,
               subscription_end timestamptz, payment_status text, cancellation_status text, linked_to_paystack boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_like text := public.admin_like(p_search); v_lim integer := least(greatest(coalesce(p_limit, 25), 1), 100); v_off integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
begin
  perform public.admin_require();
  if p_filter is null or p_filter not in ('all','premium_now','not_premium','paying','expiring_soon','complimentary','founding_member','trial','expired','cancelled','free') then
    raise exception 'unknown filter';
  end if;
  return query
  select u.id, u.email::text, p.full_name, u.created_at, e.status::text, public.premium_active_for(u.id), e.subscription_end,
         e.payment_status, e.cancellation_status, (e.paystack_customer_code is not null), count(*) over ()
    from auth.users u
    join public.entitlements e on e.user_id = u.id
    left join public.profiles p on p.id = u.id
   where (btrim(coalesce(p_search, '')) = '' or u.email ilike v_like escape '\' or p.full_name ilike v_like escape '\')
     and case p_filter
           when 'all' then true
           when 'premium_now' then public.premium_active_for(u.id)
           when 'not_premium' then not public.premium_active_for(u.id)
           when 'paying' then e.status in ('premium','cancelled') and e.payment_status = 'paid' and public.premium_active_for(u.id)
           when 'expiring_soon' then public.premium_active_for(u.id) and e.subscription_end is not null and e.subscription_end <= now() + interval '7 days'
           else e.status::text = p_filter
         end
   order by u.created_at desc, u.id
   limit v_lim offset v_off;
end $$;

-- One person: account, plan, payments, and what admins did to them. Logged.
create function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public.admin_require();
  select jsonb_build_object(
    'user_id', u.id, 'email', u.email, 'full_name', p.full_name, 'signed_up', u.created_at,
    'status', e.status, 'premium_now', public.premium_active_for(u.id),
    'subscription_start', e.subscription_start, 'subscription_end', e.subscription_end, 'trial_end', e.trial_end,
    'payment_status', e.payment_status, 'cancellation_status', e.cancellation_status,
    'paystack_customer_code', e.paystack_customer_code, 'paystack_subscription_code', e.paystack_subscription_code,
    'grant_reason', e.grant_reason,
    'payments', coalesce((select jsonb_agg(jsonb_build_object('reference', x.reference, 'kind', x.kind, 'status', x.status, 'amount_kobo', x.amount_kobo,
                  'expected_amount_kobo', x.expected_amount_kobo, 'currency', x.currency, 'paid_at', x.paid_at, 'created_at', x.created_at, 'note', x.note) order by x.created_at desc)
                  from (select * from public.payments where user_id = u.id order by created_at desc limit 50) x), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', a.created_at, 'action', a.action, 'details', a.details) order by a.created_at desc)
                  from (select * from public.audit_log where target_table = 'entitlements' and target_id = u.id::text order by created_at desc limit 20) a), '[]'::jsonb)
  ) into v
  from auth.users u join public.entitlements e on e.user_id = u.id left join public.profiles p on p.id = u.id
  where u.id = p_user;
  if v is null then raise exception 'user not found'; end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values ((select auth.uid()), 'admin_view_user', 'entitlements', p_user::text, '{}'::jsonb);
  return v;
end $$;

-- ---------- 3. Payments ----------
create function public.admin_list_payments(p_search text default null, p_status text default 'all', p_limit integer default 25, p_offset integer default 0)
returns table (reference text, email text, kind text, status text, amount_kobo bigint, expected_amount_kobo bigint, currency text, paid_at timestamptz, created_at timestamptz, note text, user_id uuid, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_like text := public.admin_like(p_search); v_lim integer := least(greatest(coalesce(p_limit, 25), 1), 100); v_off integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
begin
  perform public.admin_require();
  if p_status is null or p_status not in ('all','success','mismatch','pending') then raise exception 'unknown filter'; end if;
  return query
  select y.reference, u.email::text, y.kind, y.status, y.amount_kobo, y.expected_amount_kobo, y.currency, y.paid_at, y.created_at, y.note, y.user_id, count(*) over ()
    from public.payments y left join auth.users u on u.id = y.user_id
   where (p_status = 'all' or y.status = p_status)
     and (btrim(coalesce(p_search, '')) = '' or y.reference ilike v_like escape '\' or u.email ilike v_like escape '\')
   order by y.created_at desc, y.id
   limit v_lim offset v_off;
end $$;

-- ---------- 4. Webhooks ----------
create function public.admin_list_webhooks(p_filter text default 'problems', p_limit integer default 25, p_offset integer default 0)
returns table (id bigint, received_at timestamptz, event text, outcome text, detail text, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_lim integer := least(greatest(coalesce(p_limit, 25), 1), 100); v_off integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
begin
  perform public.admin_require();
  if p_filter is null or p_filter not in ('all','problems','error','unfinished') then raise exception 'unknown filter'; end if;
  return query
  select w.id, w.received_at, w.event, w.outcome, w.detail, count(*) over ()
    from public.webhook_events w
   where case p_filter
           when 'all' then true
           when 'error' then w.outcome = 'error'
           when 'unfinished' then w.outcome is null and w.received_at < now() - interval '2 minutes'
           else w.outcome in ('error','not_verified','rejected','mismatch','unmatched','no_reference')
                or (w.outcome is null and w.received_at < now() - interval '2 minutes')
         end
   order by w.received_at desc, w.id desc
   limit v_lim offset v_off;
end $$;

-- ---------- 5. Statistics ----------
-- Revenue = verified successful payments (what Paystack confirmed), in kobo, NGN only. Paystack fees are NOT deducted and refunds are NOT subtracted.
create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; lagos_month timestamptz := date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
begin
  perform public.admin_require();
  select jsonb_build_object(
    'generated_at', now(),
    'users_total', (select count(*) from public.entitlements),
    'signups_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'premium_now', (select count(*) from public.entitlements e where public.premium_active_for(e.user_id)),
    'paying_now', (select count(*) from public.entitlements e where e.status in ('premium','cancelled') and e.payment_status = 'paid' and public.premium_active_for(e.user_id)),
    'expiring_7d', (select count(*) from public.entitlements e where public.premium_active_for(e.user_id) and e.subscription_end is not null and e.subscription_end <= now() + interval '7 days'),
    'will_not_renew', (select count(*) from public.entitlements e where e.status = 'premium' and e.cancellation_status = 'scheduled' and public.premium_active_for(e.user_id)),
    'by_status', coalesce((select jsonb_object_agg(s, n) from (select status::text s, count(*) n from public.entitlements group by status) q), '{}'::jsonb),
    'revenue_kobo_this_month', coalesce((select sum(amount_kobo) from public.payments where status = 'success' and currency = 'NGN' and paid_at >= lagos_month), 0),
    'revenue_kobo_30d', coalesce((select sum(amount_kobo) from public.payments where status = 'success' and currency = 'NGN' and paid_at >= now() - interval '30 days'), 0),
    'revenue_kobo_all', coalesce((select sum(amount_kobo) from public.payments where status = 'success' and currency = 'NGN'), 0),
    'payments_success', (select count(*) from public.payments where status = 'success'),
    'payments_mismatch', (select count(*) from public.payments where status = 'mismatch'),
    'payments_pending_over_1h', (select count(*) from public.payments where status = 'pending' and created_at < now() - interval '1 hour'),
    'webhooks_24h', (select count(*) from public.webhook_events where received_at >= now() - interval '24 hours'),
    'webhook_problems_24h', (select count(*) from public.webhook_events where received_at >= now() - interval '24 hours'
        and (outcome in ('error','not_verified','rejected','mismatch','unmatched','no_reference') or (outcome is null and received_at < now() - interval '2 minutes'))),
    'revenue_by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'amount_kobo', amt) order by m) from (
        select to_char(date_trunc('month', paid_at at time zone 'Africa/Lagos'), 'YYYY-MM') m, sum(amount_kobo) amt
          from public.payments where status = 'success' and currency = 'NGN' and paid_at >= (lagos_month - interval '5 months')
         group by 1) r), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ---------- 6. End paid access after a refund (the only admin write besides the complimentary grant/revoke in 0001) ----------
create function public.admin_end_paid_access(target uuid, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare cur public.entitlement_status;
begin
  perform public.admin_require();
  if reason is null or char_length(btrim(reason)) = 0 or char_length(reason) > 500 then raise exception 'a reason of 1 to 500 characters is required'; end if;
  select status into cur from public.entitlements where user_id = target for update;
  if not found then raise exception 'user not found'; end if;
  if cur not in ('premium', 'cancelled', 'trial') then raise exception 'only paid, cancelled or trial access can be ended here'; end if;
  update public.entitlements set status = 'expired', payment_status = case when cur = 'trial' then payment_status else 'refunded' end,
         subscription_end = now(), cancellation_status = 'none', granted_by = (select auth.uid()), grant_reason = btrim(reason)
   where user_id = target;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values ((select auth.uid()), 'end_paid_access', 'entitlements', target::text, jsonb_build_object('previous_status', cur, 'reason', btrim(reason)));
end $$;

-- ---------- Privileges: signed-in users may call them; each one refuses non-admins itself. Anonymous visitors cannot call them at all. ----------
revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon;
revoke all on function public.admin_user_detail(uuid) from public, anon;
revoke all on function public.admin_list_payments(text, text, integer, integer) from public, anon;
revoke all on function public.admin_list_webhooks(text, integer, integer) from public, anon;
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_end_paid_access(uuid, text) from public, anon;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_list_payments(text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_webhooks(text, integer, integer) to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_end_paid_access(uuid, text) to authenticated;
