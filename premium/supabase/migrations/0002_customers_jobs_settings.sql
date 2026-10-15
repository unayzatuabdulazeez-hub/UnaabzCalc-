-- UnaabzCalc Premium V1 / Migration 0002: customers, jobs, Premium check, price setting.
-- Requires 0001. Safe on a fresh or 0001-only database. Back up before running on production.
--
-- Design rules (reuse for every future business-owned table):
--   * each row carries business_id AND user_id;
--   * composite foreign keys keep related rows inside ONE business (a job can never point at another business's customer);
--   * business_id and user_id can never be changed after insert (column-level grants);
--   * reading is allowed for the owner always (a lapsed subscriber can still see and export their data);
--   * writing requires an active Premium entitlement, checked in the database by public.has_premium().

-- ---------- Premium check (SQL twin of src/lib/entitlements/resolve.ts; a generated parity test keeps them identical) ----------
create function public.has_premium() returns boolean
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
    where e.user_id = (select auth.uid())
  ), false);
$$;
revoke all on function public.has_premium() from public, anon;
grant execute on function public.has_premium() to authenticated;

-- ---------- Needed for composite foreign keys ----------
alter table public.businesses add constraint businesses_id_owner_key unique (id, owner_id);

-- ---------- customers ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text check (phone is null or char_length(btrim(phone)) between 5 and 30),
  email text check (email is null or char_length(email) <= 254),
  address text check (address is null or char_length(address) <= 300),
  notes text check (notes is null or char_length(notes) <= 1000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the business must belong to this user: ties business_id and user_id together permanently
  constraint customers_business_owner_fk foreign key (business_id, user_id)
    references public.businesses (id, owner_id) on delete cascade,
  constraint customers_id_business_key unique (id, business_id)
);
create index customers_business_idx on public.customers (business_id, archived_at, name);
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------- jobs ----------
create type public.job_status as enum ('quote', 'in_progress', 'completed', 'cancelled');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  customer_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  status public.job_status not null default 'quote',
  due_date date,
  agreed_amount numeric(14, 2) check (agreed_amount is null or (agreed_amount >= 0 and agreed_amount < 1e12)),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_business_owner_fk foreign key (business_id, user_id)
    references public.businesses (id, owner_id) on delete cascade,
  -- customer must be in the SAME business (skipped when customer_id is null)
  constraint jobs_customer_same_business_fk foreign key (customer_id, business_id)
    references public.customers (id, business_id)
);
create index jobs_business_idx on public.jobs (business_id, archived_at, status, created_at desc);
create index jobs_customer_idx on public.jobs (customer_id);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------- app_settings (price lives here, not in code) ----------
create table public.app_settings (
  key text primary key check (key in ('premium_price')),
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
-- Launch price: NGN 4,999 per month, stored in kobo (Paystack's unit).
insert into public.app_settings (key, value)
values ('premium_price', '{"amount_kobo": 499900, "currency": "NGN", "interval": "monthly"}'::jsonb);

-- ---------- Privileges ----------
revoke all on public.customers, public.jobs, public.app_settings from public, anon, authenticated;

grant select on public.customers, public.jobs to authenticated;
grant insert (business_id, user_id, name, phone, email, address, notes) on public.customers to authenticated;
grant update (name, phone, email, address, notes, archived_at) on public.customers to authenticated;
grant insert (business_id, user_id, customer_id, title, description, status, due_date, agreed_amount) on public.jobs to authenticated;
grant update (customer_id, title, description, status, due_date, agreed_amount, archived_at) on public.jobs to authenticated;
-- No DELETE: records are archived. No access for anon.

-- Everyone (even signed-out visitors on a pricing page) may read the public price, nothing else.
grant select on public.app_settings to anon, authenticated;

-- ---------- Row-level security ----------
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.app_settings enable row level security;

create policy customers_select_own on public.customers for select to authenticated
  using (user_id = (select auth.uid()));
create policy customers_insert_premium on public.customers for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_premium()));
create policy customers_update_premium on public.customers for update to authenticated
  using (user_id = (select auth.uid()) and (select public.has_premium()))
  with check (user_id = (select auth.uid()) and (select public.has_premium()));

create policy jobs_select_own on public.jobs for select to authenticated
  using (user_id = (select auth.uid()));
create policy jobs_insert_premium on public.jobs for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_premium()));
create policy jobs_update_premium on public.jobs for update to authenticated
  using (user_id = (select auth.uid()) and (select public.has_premium()))
  with check (user_id = (select auth.uid()) and (select public.has_premium()));
-- Admins get NO access to customers or jobs.

create policy app_settings_public_read on public.app_settings for select to anon, authenticated
  using (key = 'premium_price');
-- No write policy: only admin_set_premium_price() below can change it.

-- ---------- Admin: change the price (validated, audited) ----------
create function public.admin_set_premium_price(new_amount_kobo bigint, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare old jsonb;
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if reason is null or char_length(btrim(reason)) = 0 then
    raise exception 'a reason is required';
  end if;
  -- Paystack amounts are in kobo. Allow NGN 100 to NGN 1,000,000 per month to catch typos.
  if new_amount_kobo is null or new_amount_kobo < 10000 or new_amount_kobo > 100000000 then
    raise exception 'price must be between 10000 and 100000000 kobo (NGN 100 to NGN 1,000,000)';
  end if;
  select value into old from public.app_settings where key = 'premium_price' for update;
  update public.app_settings
     set value = jsonb_build_object('amount_kobo', new_amount_kobo, 'currency', 'NGN', 'interval', 'monthly'),
         updated_by = (select auth.uid()), updated_at = now()
   where key = 'premium_price';
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values ((select auth.uid()), 'set_premium_price', 'app_settings', 'premium_price',
          jsonb_build_object('previous', old, 'new_amount_kobo', new_amount_kobo, 'reason', btrim(reason)));
end $$;
revoke all on function public.admin_set_premium_price(bigint, text) from public, anon;
grant execute on function public.admin_set_premium_price(bigint, text) to authenticated;
