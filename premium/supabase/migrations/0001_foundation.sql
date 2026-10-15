-- UnaabzCalc Premium V1 / Migration 0001: foundation
-- Profiles, entitlements, businesses, admin allowlist, audit log, row-level security.
-- Safe to run on a fresh Supabase project. Do NOT run against production without a reviewed backup.
-- Security model:
--   * Every business-owned table carries the owner's user id; RLS lets a user touch only their own rows.
--   * Users can only READ their entitlement. Only trusted server code (service role) or the admin
--     functions below can change it. There is no policy or grant that lets a user write to it.
--   * Admin status lives in public.admin_users, which no API user can write to.

-- ---------- Types ----------
create type public.entitlement_status as enum
  ('free', 'trial', 'premium', 'founding_member', 'complimentary', 'expired', 'cancelled');
create type public.admin_role as enum ('owner', 'admin');

-- ---------- Helpers ----------
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text check (full_name is null or char_length(btrim(full_name)) between 1 and 120),
  phone text check (phone is null or char_length(btrim(phone)) between 5 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- entitlements (one row per user; written ONLY by trusted server code) ----------
create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status public.entitlement_status not null default 'free',
  trial_start timestamptz,
  trial_end timestamptz,
  subscription_start timestamptz,
  subscription_end timestamptz,
  payment_status text not null default 'none'
    check (payment_status in ('none', 'pending', 'paid', 'failed', 'refunded')),
  cancellation_status text not null default 'none'
    check (cancellation_status in ('none', 'scheduled', 'cancelled')),
  paystack_customer_code text,
  paystack_subscription_code text,
  granted_by uuid references auth.users (id) on delete set null,
  grant_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trial_end is null or trial_start is null or trial_end >= trial_start),
  check (subscription_end is null or subscription_start is null or subscription_end >= subscription_start)
);
create trigger entitlements_updated_at before update on public.entitlements
  for each row execute function public.set_updated_at();

-- ---------- businesses (a user may own several) ----------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  business_type text check (business_type is null or char_length(business_type) <= 80),
  phone text check (phone is null or char_length(btrim(phone)) between 5 and 30),
  address text check (address is null or char_length(address) <= 300),
  currency char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_owner_idx on public.businesses (owner_id);
create trigger businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

-- ---------- admin allowlist (NOT writable through the API) ----------
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.admin_role not null default 'admin',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

-- ---------- audit log (append-only) ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,  -- plain uuid, no FK: the log must survive deletion of the user and cannot be updated
  action text not null,
  target_table text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

create function public.audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- ---------- New-user bootstrap ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.entitlements (user_id) values (new.id);  -- status defaults to 'free'. No trial at launch.
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Admin check ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- Privileges (Supabase grants broad defaults; remove them, then grant the minimum) ----------
revoke all on public.profiles, public.entitlements, public.businesses,
              public.admin_users, public.audit_log from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select on public.entitlements to authenticated;                       -- read-only for users
grant select on public.businesses to authenticated;
grant update (name, business_type, phone, address, currency, archived_at) on public.businesses to authenticated;
grant insert (owner_id, name, business_type, phone, address, currency) on public.businesses to authenticated;
grant select on public.admin_users to authenticated;                        -- a user can see only their own row (RLS)
grant select on public.audit_log to authenticated;                          -- admins only (RLS)
-- No DELETE on businesses in Phase 1 (archive instead). Revisit with the owner.

-- ---------- Row-level security ----------
alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;
alter table public.businesses enable row level security;
alter table public.admin_users enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_admin on public.profiles for select to authenticated
  using ((select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy entitlements_select_own on public.entitlements for select to authenticated
  using (user_id = (select auth.uid()));
create policy entitlements_select_admin on public.entitlements for select to authenticated
  using ((select public.is_admin()));
-- Deliberately NO insert/update/delete policy on entitlements.

create policy businesses_select_own on public.businesses for select to authenticated
  using (owner_id = (select auth.uid()));
create policy businesses_insert_own on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy businesses_update_own on public.businesses for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Admins get NO access to business records (data minimisation).

create policy admin_users_select_self on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));
-- Deliberately NO write policy: nobody can promote themselves or anyone else through the API.

create policy audit_log_select_admin on public.audit_log for select to authenticated
  using ((select public.is_admin()));
-- Deliberately NO write policy: rows are written only by the admin functions below.

-- ---------- Admin actions (security definer; each re-checks is_admin and writes an audit row) ----------
create function public.admin_grant_complimentary(target uuid, ends_at timestamptz, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare cur public.entitlement_status;
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if reason is null or char_length(btrim(reason)) = 0 then
    raise exception 'a reason is required';
  end if;
  if ends_at is not null and ends_at <= now() then
    raise exception 'ends_at must be in the future';
  end if;
  select status into cur from public.entitlements where user_id = target for update;
  if not found then
    raise exception 'user not found';
  end if;
  if cur in ('premium', 'founding_member') then
    raise exception 'user already has a paid or founding Premium entitlement';
  end if;
  update public.entitlements
     set status = 'complimentary', subscription_start = now(), subscription_end = ends_at,
         granted_by = (select auth.uid()), grant_reason = btrim(reason)
   where user_id = target;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values ((select auth.uid()), 'grant_complimentary', 'entitlements', target::text,
          jsonb_build_object('previous_status', cur, 'ends_at', ends_at, 'reason', btrim(reason)));
end $$;

create function public.admin_revoke_complimentary(target uuid, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare cur public.entitlement_status;
begin
  if not (select public.is_admin()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if reason is null or char_length(btrim(reason)) = 0 then
    raise exception 'a reason is required';
  end if;
  select status into cur from public.entitlements where user_id = target for update;
  if not found then
    raise exception 'user not found';
  end if;
  if cur <> 'complimentary' then
    raise exception 'only complimentary access can be revoked here';
  end if;
  update public.entitlements
     set status = 'expired', subscription_end = now(), granted_by = (select auth.uid()), grant_reason = btrim(reason)
   where user_id = target;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values ((select auth.uid()), 'revoke_complimentary', 'entitlements', target::text,
          jsonb_build_object('reason', btrim(reason)));
end $$;

revoke all on function public.admin_grant_complimentary(uuid, timestamptz, text) from public, anon;
revoke all on function public.admin_revoke_complimentary(uuid, text) from public, anon;
grant execute on function public.admin_grant_complimentary(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_revoke_complimentary(uuid, text) to authenticated;
-- The trigger functions are not meant to be called through the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.audit_log_immutable() from public, anon, authenticated;
