-- UnaabzCalc Premium V1 / Migration 0003: products
-- Follows the same rules as 0002 (customers, jobs):
--   business_id + user_id on every row, tied to a real business and its owner by a composite foreign key;
--   business_id / user_id cannot change after insert; owner can always READ; WRITING needs active Premium
--   (public.has_premium()); no DELETE (archive instead); admins have no access.
-- Requires 0001 and 0002. Back up before running on production.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  unit text check (unit is null or char_length(btrim(unit)) between 1 and 30),
  cost_price numeric(14, 2) check (cost_price is null or (cost_price >= 0 and cost_price < 1e12)),
  selling_price numeric(14, 2) check (selling_price is null or (selling_price >= 0 and selling_price < 1e12)),
  notes text check (notes is null or char_length(notes) <= 1000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_business_owner_fk foreign key (business_id, user_id)
    references public.businesses (id, owner_id) on delete cascade,
  constraint products_id_business_key unique (id, business_id)
);
create index products_business_idx on public.products (business_id, archived_at, name);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

revoke all on public.products from public, anon, authenticated;
grant select on public.products to authenticated;
grant insert (business_id, user_id, name, unit, cost_price, selling_price, notes) on public.products to authenticated;
grant update (name, unit, cost_price, selling_price, notes, archived_at) on public.products to authenticated;

alter table public.products enable row level security;
create policy products_select_own on public.products for select to authenticated
  using (user_id = (select auth.uid()));
create policy products_insert_premium on public.products for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_premium()));
create policy products_update_premium on public.products for update to authenticated
  using (user_id = (select auth.uid()) and (select public.has_premium()))
  with check (user_id = (select auth.uid()) and (select public.has_premium()));
