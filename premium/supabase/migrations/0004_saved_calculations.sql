-- UnaabzCalc Premium V1 / Migration 0004: saved calculations
-- Stores the INPUTS of a calculation (plus which calculator and which engine version), never the result.
-- The result is recomputed from the inputs by the shared calculation engine every time a record is opened or
-- exported, so a user cannot store a fabricated result, and totals shown, exported and saved can never disagree.
-- Same ownership rules as 0002/0003: business_id + user_id tied to a real business and its owner; links to a
-- customer, job or product must be in the SAME business; business_id/user_id cannot change; owner can always
-- read; writing needs active Premium; admins have no access.
-- DELETE is allowed for the owner even when the plan has lapsed: removing your own data is never paywalled.
-- Requires 0001 to 0003 and PostgreSQL 15+.

alter table public.jobs add constraint jobs_id_business_key unique (id, business_id);

create table public.saved_calculations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  user_id uuid not null,
  calculator_id text not null check (calculator_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(calculator_id) <= 60),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) <= 30000),
  engine_version text not null check (char_length(engine_version) between 1 and 64),
  notes text check (notes is null or char_length(notes) <= 2000),
  customer_id uuid,
  job_id uuid,
  product_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_calculations_business_owner_fk foreign key (business_id, user_id)
    references public.businesses (id, owner_id) on delete cascade,
  -- each link must point inside the same business (skipped when the column is null)
  constraint saved_calculations_customer_fk foreign key (customer_id, business_id)
    references public.customers (id, business_id) on delete set null (customer_id),
  constraint saved_calculations_job_fk foreign key (job_id, business_id)
    references public.jobs (id, business_id) on delete set null (job_id),
  constraint saved_calculations_product_fk foreign key (product_id, business_id)
    references public.products (id, business_id) on delete set null (product_id)
);
create index saved_calculations_list_idx on public.saved_calculations (business_id, archived_at, created_at desc);
create index saved_calculations_calc_idx on public.saved_calculations (business_id, calculator_id);
create index saved_calculations_customer_idx on public.saved_calculations (customer_id) where customer_id is not null;
create index saved_calculations_job_idx on public.saved_calculations (job_id) where job_id is not null;
create index saved_calculations_product_idx on public.saved_calculations (product_id) where product_id is not null;
create trigger saved_calculations_updated_at before update on public.saved_calculations
  for each row execute function public.set_updated_at();

revoke all on public.saved_calculations from public, anon, authenticated;
grant select, delete on public.saved_calculations to authenticated;
grant insert (business_id, user_id, calculator_id, title, inputs, engine_version, notes, customer_id, job_id, product_id)
  on public.saved_calculations to authenticated;
grant update (title, inputs, engine_version, notes, customer_id, job_id, product_id, archived_at)
  on public.saved_calculations to authenticated;
-- calculator_id is not updatable: a record is always the same kind of calculation. Duplicate instead.

alter table public.saved_calculations enable row level security;
create policy saved_calculations_select_own on public.saved_calculations for select to authenticated
  using (user_id = (select auth.uid()));
create policy saved_calculations_insert_premium on public.saved_calculations for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_premium()));
create policy saved_calculations_update_premium on public.saved_calculations for update to authenticated
  using (user_id = (select auth.uid()) and (select public.has_premium()))
  with check (user_id = (select auth.uid()) and (select public.has_premium()));
create policy saved_calculations_delete_own on public.saved_calculations for delete to authenticated
  using (user_id = (select auth.uid()));
