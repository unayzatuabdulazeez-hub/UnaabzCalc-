-- UnaabzCalc Premium V1 / Migration 0005: payments (Paystack)
-- Design (see docs/PAYMENTS.md):
--   * Users can READ their own payment history. They can never write payments or entitlements.
--   * ONLY trusted server code using the Supabase service role may call the functions below. Each one is idempotent
--     and runs in one transaction, so a retried or duplicated webhook can never grant twice.
--   * Premium is granted ONLY for a payment whose reference we created for that user at checkout (amount and currency must
--     match what was expected) or for a renewal on a customer code that is already stored on that user's entitlement.
--   * A payment never changes a founding member's status, and a failed charge never removes access that was already paid for.
-- Requires 0001 to 0004. Back up before running on production.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,   -- plain uuid, no FK: payment history is kept for accounting even if the account is deleted
  reference text not null unique check (reference ~ '^[A-Za-z0-9.=-]{8,100}$'),
  provider text not null default 'paystack' check (provider = 'paystack'),
  kind text not null check (kind in ('checkout', 'renewal')),
  status text not null default 'pending' check (status in ('pending', 'success', 'mismatch')),
  expected_amount_kobo bigint check (expected_amount_kobo is null or expected_amount_kobo > 0),
  amount_kobo bigint check (amount_kobo is null or amount_kobo > 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  plan_code text check (plan_code is null or char_length(plan_code) <= 100),
  paystack_tx_id text unique check (paystack_tx_id is null or char_length(paystack_tx_id) <= 100),
  paid_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.webhook_events (
  id bigint generated always as identity primary key,
  body_hash text not null unique check (body_hash ~ '^[0-9a-f]{64}$'),
  event text not null check (char_length(event) <= 100),
  received_at timestamptz not null default now(),
  outcome text check (outcome is null or char_length(outcome) <= 60),
  detail text check (detail is null or char_length(detail) <= 500)
);

create index entitlements_paystack_customer_idx on public.entitlements (paystack_customer_code) where paystack_customer_code is not null;
create index entitlements_paystack_subscription_idx on public.entitlements (paystack_subscription_code) where paystack_subscription_code is not null;

revoke all on public.payments, public.webhook_events from public, anon, authenticated;
grant select on public.payments to authenticated;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
create policy payments_select_own on public.payments for select to authenticated using (user_id = (select auth.uid()));
-- Deliberately NO write policy on payments and NO policy at all on webhook_events: only the service role (which bypasses RLS) touches them.

-- ---------- 1. Start a checkout: remember what we expect to be paid, for this user ----------
create function public.create_checkout_payment(p_user uuid, p_reference text, p_expected_kobo bigint, p_plan_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.entitlements where user_id = p_user) then raise exception 'unknown user'; end if;
  insert into public.payments (user_id, reference, kind, status, expected_amount_kobo, currency, plan_code)
  values (p_user, p_reference, 'checkout', 'pending', p_expected_kobo, 'NGN', p_plan_code);
end $$;

-- ---------- 2. A successful, already-verified charge (checkout or renewal) ----------
create function public.apply_paystack_charge(
  p_reference text, p_tx_id text, p_amount_kobo bigint, p_currency text, p_paid_at timestamptz,
  p_customer_code text, p_subscription_code text, p_plan_code text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments%rowtype; v_ent public.entitlements%rowtype;
  v_user uuid; v_kind text; v_note text; v_paid timestamptz; v_base timestamptz; v_start timestamptz; v_end timestamptz; v_price bigint;
begin
  if p_reference is null or p_reference !~ '^[A-Za-z0-9.=-]{8,100}$' then return 'rejected'; end if;
  if p_amount_kobo is null or p_amount_kobo <= 0 or p_amount_kobo > 100000000000 then return 'rejected'; end if;
  perform pg_advisory_xact_lock(hashtext(p_reference));          -- two deliveries of the same charge run one after the other
  v_paid := least(coalesce(p_paid_at, now()), now());             -- a payment date in the future is never trusted

  if p_tx_id is not null and exists (select 1 from public.payments where paystack_tx_id = p_tx_id and status = 'success') then return 'duplicate'; end if;
  select * into v_pay from public.payments where reference = p_reference;
  if found then
    if v_pay.status = 'success' then return 'duplicate'; end if;
    v_user := v_pay.user_id; v_kind := v_pay.kind;
    if p_currency is distinct from 'NGN' or p_amount_kobo is distinct from v_pay.expected_amount_kobo then
      update public.payments set status = 'mismatch', amount_kobo = p_amount_kobo, currency = p_currency,
             note = 'amount or currency differs from what was expected at checkout; no access was granted' where id = v_pay.id;
      return 'mismatch';
    end if;
  else
    -- Not one of our checkouts: only a renewal for a customer code already stored on a user's entitlement is accepted.
    if p_customer_code is null then return 'unmatched'; end if;
    select user_id into v_user from public.entitlements where paystack_customer_code = p_customer_code limit 1;
    if v_user is null then return 'unmatched'; end if;
    v_kind := 'renewal';
    if p_currency is distinct from 'NGN' then
      insert into public.payments (user_id, reference, kind, status, amount_kobo, currency, plan_code, paystack_tx_id, paid_at, note)
      values (v_user, p_reference, 'renewal', 'mismatch', p_amount_kobo, p_currency, p_plan_code, p_tx_id, v_paid, 'renewal in a currency other than NGN; no access was granted');
      return 'mismatch';
    end if;
    select (value ->> 'amount_kobo')::bigint into v_price from public.app_settings where key = 'premium_price';
    if v_price is not null and v_price <> p_amount_kobo then v_note := 'renewal amount differs from the current price setting (' || v_price || ' kobo)'; end if;
  end if;

  select * into v_ent from public.entitlements where user_id = v_user for update;
  if not found then return 'unmatched'; end if;

  if v_ent.status = 'founding_member' then
    v_note := coalesce(v_note || '; ', '') || 'founding member: status left unchanged';
  else
    if v_ent.status in ('premium', 'cancelled') and v_ent.payment_status = 'paid' and v_ent.subscription_end is not null and v_ent.subscription_end > v_paid then
      v_base := v_ent.subscription_end; v_start := coalesce(v_ent.subscription_start, v_paid);   -- still paid up: extend, no gap, no overlap
    else
      v_base := v_paid; v_start := v_paid;
    end if;
    v_end := ((v_base at time zone 'UTC') + interval '1 month') at time zone 'UTC';
    update public.entitlements set status = 'premium', payment_status = 'paid', cancellation_status = 'none',
           subscription_start = v_start, subscription_end = v_end,
           paystack_customer_code = coalesce(p_customer_code, paystack_customer_code),
           paystack_subscription_code = coalesce(p_subscription_code, paystack_subscription_code),
           granted_by = null, grant_reason = null
     where user_id = v_user;
  end if;

  if v_pay.id is not null then
    update public.payments set status = 'success', amount_kobo = p_amount_kobo, currency = 'NGN', paystack_tx_id = p_tx_id, paid_at = v_paid, note = v_note where id = v_pay.id;
  else
    insert into public.payments (user_id, reference, kind, status, amount_kobo, currency, plan_code, paystack_tx_id, paid_at, note)
    values (v_user, p_reference, v_kind, 'success', p_amount_kobo, 'NGN', p_plan_code, p_tx_id, v_paid, v_note);
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (null, 'paystack_payment', 'entitlements', v_user::text, jsonb_build_object('reference', p_reference, 'amount_kobo', p_amount_kobo, 'kind', v_kind));
  return case when v_ent.status = 'founding_member' then 'recorded_no_change' else 'granted' end;
end $$;

-- ---------- 3. Subscription lifecycle events (create, not_renew, disable) ----------
create function public.apply_paystack_subscription_event(p_kind text, p_customer_code text, p_subscription_code text, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_ent public.entitlements%rowtype;
begin
  if p_kind not in ('create', 'not_renew', 'disable') then return 'ignored'; end if;
  if p_kind = 'create' then
    -- Attach the Paystack codes to the account that owns this e-mail. This grants nothing; access comes only from apply_paystack_charge.
    if p_email is null or p_customer_code is null or p_subscription_code is null then return 'ignored'; end if;
    select e.* into v_ent from public.entitlements e join auth.users u on u.id = e.user_id where lower(u.email) = lower(p_email) for update of e;
    if not found then return 'unmatched'; end if;
    if v_ent.paystack_customer_code is not null and v_ent.paystack_customer_code <> p_customer_code then return 'ignored'; end if;
    update public.entitlements set paystack_customer_code = p_customer_code, paystack_subscription_code = p_subscription_code where user_id = v_ent.user_id;
    return 'updated';
  end if;
  select * into v_ent from public.entitlements
   where (p_subscription_code is not null and paystack_subscription_code = p_subscription_code)
      or (p_subscription_code is null and p_customer_code is not null and paystack_customer_code = p_customer_code)
   limit 1 for update;
  if not found then return 'unmatched'; end if;
  if v_ent.status <> 'premium' then return 'ignored'; end if;   -- never touches complimentary, founding, expired or already cancelled users
  if p_kind = 'not_renew' then
    update public.entitlements set cancellation_status = 'scheduled' where user_id = v_ent.user_id;
  else
    update public.entitlements set status = 'cancelled', cancellation_status = 'cancelled' where user_id = v_ent.user_id;  -- paid access continues to subscription_end
  end if;
  return 'updated';
end $$;

-- ---------- 4. Webhook de-duplication (a retry of an event that failed is processed again; a finished one is not) ----------
create function public.claim_webhook_event(p_hash text, p_event text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_outcome text; v_rows integer;
begin
  insert into public.webhook_events (body_hash, event) values (p_hash, left(p_event, 100)) on conflict (body_hash) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then return true; end if;
  select outcome into v_outcome from public.webhook_events where body_hash = p_hash;
  return v_outcome is null or v_outcome = 'error';
end $$;
create function public.finish_webhook_event(p_hash text, p_outcome text, p_detail text) returns void
language sql security definer set search_path = '' as $$
  update public.webhook_events set outcome = left(p_outcome, 60), detail = left(p_detail, 500) where body_hash = p_hash;
$$;

-- Only the service role may call any of these.
revoke all on function public.create_checkout_payment(uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.apply_paystack_charge(text, text, bigint, text, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_paystack_subscription_event(text, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.finish_webhook_event(text, text, text) from public, anon, authenticated;
grant execute on function public.create_checkout_payment(uuid, text, bigint, text) to service_role;
grant execute on function public.apply_paystack_charge(text, text, bigint, text, timestamptz, text, text, text) to service_role;
grant execute on function public.apply_paystack_subscription_event(text, text, text, text) to service_role;
grant execute on function public.claim_webhook_event(text, text) to service_role;
grant execute on function public.finish_webhook_event(text, text, text) to service_role;
