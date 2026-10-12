-- UnaabzCalc Premium V1 / Migration 0007: stop one account from creating unlimited unpaid checkouts.
-- Replaces create_checkout_payment from 0005 (same signature and privileges). A real person never needs more than a few attempts in an hour.
create or replace function public.create_checkout_payment(p_user uuid, p_reference text, p_expected_kobo bigint, p_plan_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.entitlements where user_id = p_user) then raise exception 'unknown user'; end if;
  if (select count(*) from public.payments where user_id = p_user and status = 'pending' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many unfinished checkouts' using errcode = 'P0001';
  end if;
  insert into public.payments (user_id, reference, kind, status, expected_amount_kobo, currency, plan_code)
  values (p_user, p_reference, 'checkout', 'pending', p_expected_kobo, 'NGN', p_plan_code);
end $$;
