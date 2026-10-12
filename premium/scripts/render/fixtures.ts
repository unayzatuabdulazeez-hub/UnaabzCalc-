/** TEST HARNESS ONLY. Realistic-looking fake data for rendering pages. Nothing here is real. */
const BID = "11111111-1111-4111-8111-111111111111", UID = "22222222-2222-4222-8222-222222222222";
const RID = "33333333-3333-4333-8333-333333333333", CID = "44444444-4444-4444-8444-444444444444", JID = "55555555-5555-4555-8555-555555555555";
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
export const IDS = { BID, UID, RID, CID, JID };

export const entitlement = (over: Record<string, unknown> = {}) => ({ user_id: UID, status: "free", trial_start: null, trial_end: null, subscription_start: null, subscription_end: null, payment_status: "none", cancellation_status: "none", paystack_customer_code: null, paystack_subscription_code: null, ...over });
export const premiumEnt = () => entitlement({ status: "premium", payment_status: "paid", subscription_start: iso(-5), subscription_end: iso(25), paystack_customer_code: "CUS_demo1234", paystack_subscription_code: "SUB_demo1234" });

export function baseTables(ent: Record<string, unknown>) {
  const customers = Array.from({ length: 6 }, (_, i) => ({ id: i === 0 ? CID : `c000000${i}-0000-4000-8000-000000000000`, business_id: BID, name: ["Ada Okonkwo Fashion House", "Mama Tunde", "Chinedu & Sons Ltd", "Bisi", "Hajiya Zainab", "Emeka"][i], phone: "+234 803 123 45" + (60 + i), email: i % 2 ? null : `c${i}@example.com`, address: "12 Allen Avenue, Ikeja, Lagos", notes: i === 0 ? "Pays on delivery. Prefers WhatsApp." : null, archived_at: null, created_at: iso(-30 + i) }));
  const jobs = Array.from({ length: 6 }, (_, i) => ({ id: i === 0 ? JID : `d000000${i}-0000-4000-8000-000000000000`, business_id: BID, customer_id: CID, title: ["Wedding aso-ebi, 20 pieces", "Shop signboard", "Birthday cake x3", "Curtains for living room", "School uniforms (120)", "Office chairs repair"][i], description: "Deposit paid.", status: ["quote", "in_progress", "completed", "in_progress", "cancelled", "quote"][i], due_date: i === 1 ? new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10) : new Date(Date.now() + (i + 3) * 86_400_000).toISOString().slice(0, 10), agreed_amount: [450000, 85000.5, 36000, 120000, 960000, 15000][i], archived_at: null, created_at: iso(-20 + i) }));
  const products = Array.from({ length: 5 }, (_, i) => ({ id: `e000000${i}-0000-4000-8000-000000000000`, business_id: BID, name: ["Ankara fabric (6 yards)", "Zip, 20cm", "Brown sugar 50kg bag", "Cooking oil 25L", "Cement 50kg"][i], unit: ["bundle", "piece", "bag", "keg", "bag"][i], cost_price: [12000, 150, 62000, 48000, 5200][i], selling_price: [15500, 250, 70000, i === 3 ? 45000 : 56000, 6500][i], notes: null, archived_at: null, created_at: iso(-10 + i) }));
  const calcs = [
    { id: RID, business_id: BID, calculator_id: "profit", title: "Ankara markup, October", inputs: { cost: "12000", sell: "15500" }, engine_version: "abc", notes: null, customer_id: CID, job_id: null, product_id: null, archived_at: null, created_at: iso(-2), updated_at: iso(-2) },
    { id: "66666666-6666-4666-8666-666666666666", business_id: BID, calculator_id: "loan", title: "Equipment loan", inputs: { principal: "1000000", rate: "12", term: "12", unit: "months" }, engine_version: "abc", notes: null, customer_id: null, job_id: null, product_id: null, archived_at: null, created_at: iso(-1), updated_at: iso(-1) },
  ];
  return {
    entitlements: [ent], businesses: [{ id: BID, owner_id: UID, name: "Ada's Fashion Studio", business_type: "Tailoring", currency: "NGN", phone: "+234 803 000 0000", address: "Lagos", archived_at: null, created_at: iso(-60) }],
    customers, jobs, products, saved_calculations: calcs,
    app_settings: [{ key: "premium_price", value: { amount_kobo: 499900, currency: "NGN", interval: "monthly" } }],
    payments: [
      { id: 1, reference: "UC-0a1b2c3d4e5f", kind: "checkout", status: "success", amount_kobo: 499900, paid_at: iso(-5), created_at: iso(-5), note: null },
      { id: 2, reference: "RN-9f8e7d6c5b4a", kind: "renewal", status: "success", amount_kobo: 499900, paid_at: iso(-35), created_at: iso(-35), note: null },
    ],
  };
}
export const adminRpc = {
  is_admin: true,
  admin_stats: { generated_at: iso(0), users_total: 128, signups_7d: 9, signups_30d: 41, premium_now: 33, paying_now: 27, expiring_7d: 4, will_not_renew: 3, by_status: { free: 95, premium: 24, complimentary: 3, founding_member: 4, expired: 2 }, revenue_kobo_this_month: 7_498_500, revenue_kobo_30d: 13_497_300, revenue_kobo_all: 82_484_500, payments_success: 165, payments_mismatch: 1, payments_pending_over_1h: 2, webhooks_24h: 37, webhook_problems_24h: 1, revenue_by_month: [{ month: "2026-08", amount_kobo: 11_998_500 }, { month: "2026-09", amount_kobo: 14_997_000 }, { month: "2026-10", amount_kobo: 7_498_500 }] },
  admin_list_users: () => Array.from({ length: 8 }, (_, i) => ({ user_id: `a000000${i}-0000-4000-8000-000000000000`, email: `person${i}.with.a.rather.long.address@example.com`, full_name: i % 2 ? "Chukwuemeka Oluwaseun-Abubakar" : null, signed_up: iso(-i * 5), status: ["premium", "free", "cancelled", "complimentary", "expired", "free", "founding_member", "trial"][i], premium_now: i % 3 !== 1, subscription_end: iso(10 - i), payment_status: "paid", cancellation_status: i === 2 ? "scheduled" : "none", linked_to_paystack: i === 0, total: 57 })),
  admin_list_payments: () => Array.from({ length: 6 }, (_, i) => ({ reference: `UC-ref${i}abcdef0123`, email: i === 5 ? null : `buyer${i}@example.com`, kind: i % 2 ? "renewal" : "checkout", status: ["success", "success", "mismatch", "pending", "success", "success"][i], amount_kobo: i === 3 ? null : 499900, expected_amount_kobo: 499900, currency: "NGN", paid_at: iso(-i), created_at: iso(-i), note: i === 2 ? "amount or currency differs from what was expected at checkout; no access was granted" : null, user_id: `a000000${i}-0000-4000-8000-000000000000`, total: 31 })),
  admin_list_webhooks: () => Array.from({ length: 5 }, (_, i) => ({ id: i + 1, received_at: iso(-i / 10), event: ["charge.success", "charge.success", "subscription.create", "charge.success", "subscription.disable"][i], outcome: ["granted", "error", "not_verified", null, "updated"][i], detail: i === 1 ? "database refused the payment record" : null, total: 12 })),
  admin_user_detail: { user_id: "a0000000-0000-4000-8000-000000000000", email: "person0.with.a.rather.long.address@example.com", full_name: "Chukwuemeka Oluwaseun-Abubakar", signed_up: iso(-40), status: "premium", premium_now: true, subscription_start: iso(-5), subscription_end: iso(25), trial_end: null, payment_status: "paid", cancellation_status: "none", paystack_customer_code: "CUS_demo1234", paystack_subscription_code: "SUB_demo1234", grant_reason: null,
    payments: [{ reference: "UC-0a1b2c3d4e5f", kind: "checkout", status: "success", amount_kobo: 499900, expected_amount_kobo: 499900, currency: "NGN", paid_at: iso(-5), created_at: iso(-5), note: null }],
    history: [{ at: iso(-1), action: "admin_view_user", details: {} }, { at: iso(-9), action: "grant_complimentary", details: { reason: "Launch giveaway winner" } }] },
};
