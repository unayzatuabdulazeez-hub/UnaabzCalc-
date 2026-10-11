/* UnaabzCalc engine: pure functions, no DOM, no network. Reusable by a future backend/API. */
(function (root) {
  'use strict';
  const E = {};
  const PPY = { monthly: 12, weekly: 52, biweekly: 26, quarterly: 4, yearly: 1 };
  const bad = (error) => ({ ok: false, error });
  const ok = (d) => Object.assign({ ok: true }, d);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  /* ---- Registry: add future calculators here with access:'premium' ---- */
  E.categories = { everyday: 'Everyday Calculators', business: 'Business Calculators', finance: 'Finance', farming: 'Farming Starters' };
  E.registry = [
    { id: 'basic', name: 'Basic Calculator', category: 'everyday', access: 'free', description: 'Add, subtract, multiply, divide and work with percentages and decimals.' },
    { id: 'percentage', name: 'Percentage Calculator', category: 'everyday', access: 'free', description: 'Find X% of Y, percentage increase, decrease and difference.' },
    { id: 'profit', name: 'Profit Calculator', category: 'business', access: 'free', description: 'Enter cost and selling price to see profit or loss, margin and markup.' },
    { id: 'discount', name: 'Discount Calculator', category: 'business', access: 'free', description: 'Work out the discount amount, final price and amount saved.' },
    { id: 'retail-pricing', name: 'Retail Pricing Calculator', category: 'business', access: 'free', description: 'Get the right selling price from your cost, expenses and target markup or margin.' },
    { id: 'target-profit', name: 'Target Profit Calculator', category: 'business', access: 'free', description: 'Find the price or number of units you need to reach your profit goal.' },
    { id: 'business-expenses', name: 'Business Expense Calculator', category: 'business', access: 'free', description: 'Add up rent, transport, staff and other costs with a yearly projection.' },
    { id: 'multiple-products', name: 'Multiple Products Calculator', category: 'business', access: 'free', description: 'Compare profit across several products and see your overall margin.' },
    { id: 'loan', name: 'Loan Calculator', category: 'finance', access: 'free', description: 'Estimate monthly payment, total repayment and total interest.' },
    { id: 'loan-repayment', name: 'Loan Repayment Calculator', category: 'finance', access: 'free', description: 'See a full repayment schedule with principal, interest and balance.' },
    /* free_limit / premium_limit / free_features / premium_features: the shape future tiers will plug into.
       premium_limit stays null until Premium exists. premium_features is a PLANNED list only: nothing in it is built. */
    { id: 'import-landed-cost', name: 'Mini Import / Landed Cost Calculator', icon: '📦', category: 'business', access: 'free',
      description: 'Find your true landed cost, profit and break-even price for a small import.',
      free_limit: { metric: 'product value', max: 500000, unit: 'NGN', label: 'Free version: product value up to ₦500,000',
        exceeded: 'Your shipment value is above the Free version limit of ₦500,000. The Free version is designed for mini importers. Support for larger shipments, multiple products and more detailed import costing will be available in Premium (coming soon).' },
      premium_limit: null, free_features: ['Single product', 'Landed cost, profit and break-even'],
      premium_features: ['Shipments above ₦500,000', 'Multiple products and suppliers', 'Shipping allocation by weight, quantity or CBM', 'Currency conversion', 'Scenario comparison', 'Saved shipments and history'] },
    { id: 'handwork-pricing', name: 'Handwork & Service Pricing Calculator', category: 'business', access: 'free',
      description: 'Work out your total cost and what to charge for made-to-order products or hands-on services.',
      free_limit: null, premium_limit: null, free_features: ['Unlimited materials', 'Labour by total or by hour', 'Price by amount, markup or margin'],
      premium_features: ['Saved jobs', 'Customer and job history', 'Multiple projects', 'PDF/Excel export', 'Advanced labour costing', 'Recurring service pricing'] },
    { id: 'poultry-starter', name: 'Poultry Farming Starter Calculator', icon: '🐔', category: 'farming', access: 'free',
      description: 'Estimate the cost and possible profit of starting a small poultry batch.',
      free_limit: { metric: 'birds', max: 100, unit: 'birds', label: 'Free version: up to 100 birds',
        exceeded: 'Your current input is above the Free version limit of 100 birds. Advanced farm planning for larger operations will be available in Premium (coming soon).' },
      premium_limit: null, free_features: ['Single batch', 'Cost, profit, break-even and mortality assumption'],
      premium_features: ['More than 100 birds', 'Broiler and layer planning', 'Multiple batches and cycles', 'Feed and mortality scenarios', 'Egg production projections', 'Saved farm plans'] },
    { id: 'fish-starter', name: 'Fish Farming Starter Calculator', icon: '🐟', category: 'farming', access: 'free',
      description: 'Estimate the cost and possible profit of starting a small fish pond.',
      free_limit: { metric: 'fish', max: 100, unit: 'fish', label: 'Free version: up to 100 fish',
        exceeded: 'Your current input is above the Free version limit of 100 fish. Advanced farm planning for larger operations will be available in Premium (coming soon).' },
      premium_limit: null, free_features: ['Single batch', 'Cost, profit, break-even and mortality assumption'],
      premium_features: ['More than 100 fish', 'Multiple ponds and batches', 'Feed, mortality and growth scenarios', 'Profit forecasting', 'Saved farm plans'] }
  ];
  // Phase 2: replace with entitlements verified by a trusted backend. Never trust frontend-only checks for paid features.
  E.canAccess = (calc) => calc.access === 'free';

  /* ---- Helpers ---- */
  E.num = (v) => {
    if (typeof v === 'number') return v;
    const s = String(v == null ? '' : v).replace(/[,\s₦$£€]/g, '');
    return s === '' ? NaN : Number(s);
  };
  // items: [label, value, {gt, min, max}]
  function chk(items) {
    for (const [l, v, o = {}] of items) {
      if (!Number.isFinite(v)) return `Please enter a valid ${l}.`;
      if (o.gt !== undefined && !(v > o.gt)) return `${cap(l)} must be greater than ${o.gt}.`;
      if (v < 0) return `${cap(l)} cannot be negative.`;
      if (o.max !== undefined && v > o.max) return `${cap(l)} cannot be more than ${o.max}.`;
      if (v > 1e15) return `${cap(l)} is too large.`;
    }
    return null;
  }

  /* ---- Basic: safe recursive-descent parser, no eval ---- */
  E.basic = (s) => {
    const t = String(s).replace(/\s/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    if (!t) return bad('Enter a calculation.');
    let i = 0, pc = false, tp = false; // pc: last value was a % ; tp: last term was a bare %
    const err = (m) => { throw new Error(m); };
    const peek = () => t[i];
    // Phone-calculator rule: in a + or - a bare % is a percentage OF the running total (50+10% = 55, 200-10% = 180).
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const o = t[i++], r = term(), d = tp ? v * r : r; v = o === '+' ? v + d : v - d; } return v; }
    function term() {
      let v = un(), pure = pc;
      while (peek() === '*' || peek() === '/') {
        const o = t[i++], r = un();
        if (o === '/') { if (r === 0) err('Cannot divide by zero.'); v /= r; } else v *= r;
        pure = false;
      }
      tp = pure;
      return v;
    }
    function un() { if (peek() === '-') { i++; return -un(); } if (peek() === '+') { i++; return un(); } let v = prim(), p = false; while (peek() === '%') { i++; v /= 100; p = true; } pc = p; return v; }
    function prim() {
      if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') err('Missing closing bracket.'); i++; return v; }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(t.slice(i));
      if (!m) err('Incomplete calculation.');
      i += m[0].length; return parseFloat(m[0]);
    }
    try {
      const v = expr();
      if (i < t.length) err('Invalid calculation.');
      if (!Number.isFinite(v) || Math.abs(v) > 1e15) err('Result is too large.');
      return ok({ value: parseFloat(v.toPrecision(12)) });
    } catch (e) { return bad(e.message); }
  };

  /* ---- Percentage: mode 'of' | 'change' | 'difference' ---- */
  E.percentage = (mode, a, b) => {
    const e = chk(mode === 'of' ? [['percentage', a], ['number', b]] : [['first value', a], ['second value', b]]);
    if (e) return bad(e);
    if (mode === 'of') return ok({ result: a / 100 * b });
    if (mode === 'change') {
      if (a === 0) return bad('The starting value must be greater than 0.');
      const p = (b - a) / a * 100;
      return ok({ percent: p, direction: p > 0 ? 'increase' : p < 0 ? 'decrease' : 'none', amount: b - a });
    }
    if (a + b === 0) return bad('Enter at least one value above 0.');
    return ok({ percent: Math.abs(a - b) / ((a + b) / 2) * 100, amount: Math.abs(a - b) });
  };

  E.profit = (cost, sell) => {
    const e = chk([['cost price', cost], ['selling price', sell]]);
    if (e) return bad(e);
    const profit = sell - cost;
    return ok({ profit, margin: sell > 0 ? profit / sell * 100 : null, markup: cost > 0 ? profit / cost * 100 : null });
  };

  E.discount = (price, pct) => {
    const e = chk([['original price', price], ['discount percentage', pct, { max: 100 }]]);
    if (e) return bad(e);
    const saved = price * pct / 100;
    return ok({ discount: saved, final: price - saved, saved });
  };

  /* ---- Loan: standard amortizing formula P*r / (1-(1+r)^-n); zero-interest handled ---- */
  E.loan = ({ principal, rate, term, unit, freq }) => {
    const e = chk([['loan amount', principal, { gt: 0 }], ['interest rate', rate, { max: 200 }], ['loan duration', term, { gt: 0 }]]);
    if (e) return bad(e);
    const ppy = PPY[freq || 'monthly'];
    if (!ppy) return bad('Please choose a payment frequency.');
    const years = unit === 'months' ? term / 12 : term;
    if (years > 100) return bad('Loan duration cannot be more than 100 years.');
    const n = Math.round(years * ppy);
    if (n < 1) return bad('The loan duration is too short for this payment frequency.');
    const r = rate / 100 / ppy;
    const payment = r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
    let bal = principal; const schedule = [];
    for (let k = 1; k <= n; k++) {
      const interest = bal * r, prin = payment - interest;
      bal = k === n ? 0 : bal - prin;
      schedule.push({ no: k, principal: prin, interest, balance: Math.max(0, bal) });
    }
    const total = payment * n;
    return ok({ payment, total, interest: total - principal, n, schedule });
  };

  /* ---- Retail pricing: mode 'markup' | 'margin' ---- */
  E.retailPrice = ({ cost, expenses, mode, value, discount }) => {
    const e = chk([['product cost', cost], ['additional expenses', expenses], [mode === 'margin' ? 'profit margin' : 'markup', value, { max: mode === 'margin' ? 99.99 : 100000 }], ['discount', discount, { max: 100 }]]);
    if (e) return bad(e);
    const base = cost + expenses;
    if (base <= 0) return bad('Product cost must be greater than 0.');
    const price = mode === 'margin' ? base / (1 - value / 100) : base * (1 + value / 100);
    const profit = price - base, after = price * (1 - discount / 100), profitAfter = after - base;
    return ok({ base, price, profit, margin: profit / price * 100, markup: profit / base * 100, after, profitAfter, marginAfter: after > 0 ? profitAfter / after * 100 : null });
  };

  /* ---- Target profit: units given -> required price; else price given -> required units ---- */
  E.targetProfit = ({ cost, profit, fixed, units, price }) => {
    const e = chk([['cost per product', cost], ['desired profit', profit], ['fixed expenses', fixed], ['number of units', units], ['selling price', price]]);
    if (e) return bad(e);
    if (units > 0) {
      const totalCost = cost * units + fixed, revenue = totalCost + profit;
      return ok({ mode: 'price', price: revenue / units, revenue, totalCost, profit, units });
    }
    if (price > 0) {
      if (price <= cost) return bad('Your selling price must be higher than the cost per product.');
      const u = Math.ceil((fixed + profit) / (price - cost)), revenue = u * price, totalCost = cost * u + fixed;
      return ok({ mode: 'units', price, revenue, totalCost, profit: revenue - totalCost, units: u });
    }
    return bad('Enter the number of units you expect to sell, or your selling price.');
  };

  /* ---- Expenses: rows [{name, amount}] (amounts per month) ---- */
  E.expenses = (rows) => {
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = String(rows[i].amount == null ? '' : rows[i].amount).trim();
      if (raw === '') continue;
      const name = String(rows[i].name || '').trim() || `Expense ${i + 1}`, a = E.num(raw);
      const m = chk([[`amount for ${name}`, a]]);
      if (m) return bad(m);
      items.push({ name, amount: a });
    }
    if (!items.length) return bad('Enter at least one expense amount.');
    const monthly = items.reduce((s, x) => s + x.amount, 0);
    return ok({ monthly, yearly: monthly * 12, items: items.map((x) => Object.assign(x, { share: monthly > 0 ? x.amount / monthly * 100 : 0 })) });
  };

  /* ---- Multiple products: rows [{name, qty, cost, sell}] ---- */
  E.multipleProducts = (rows) => {
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!['name', 'qty', 'cost', 'sell'].some((k) => String(r[k] || '').trim() !== '')) continue;
      const name = String(r.name || '').trim() || `Product ${i + 1}`;
      const qty = E.num(r.qty), cost = E.num(r.cost), sell = E.num(r.sell);
      const m = chk([[`quantity for ${name}`, qty, { gt: 0 }], [`cost price for ${name}`, cost], [`selling price for ${name}`, sell]]);
      if (m) return bad(m);
      items.push({ name, qty, cost: qty * cost, sales: qty * sell, profit: qty * (sell - cost) });
    }
    if (!items.length) return bad('Add at least one product.');
    const sum = (k) => items.reduce((s, x) => s + x[k], 0);
    const sales = sum('sales'), profit = sum('profit');
    return ok({ items, totalCost: sum('cost'), totalSales: sales, totalProfit: profit, units: sum('qty'), margin: sales > 0 ? profit / sales * 100 : null });
  };

  /* ---- Free-tier limits (read from the registry so Premium can raise them later) ---- */
  function limitHit(id, value) {
    const l = E.registry.find((c) => c.id === id).free_limit;
    return value > l.max ? { ok: false, premium: true, message: l.exceeded, limit: l.label } : null;
  }

  /* ---- Mini import / landed cost. All figures come from the user. ---- */
  E.importCost = (v) => {
    const e = chk([['product cost per unit', v.cost, { gt: 0 }], ['quantity', v.qty, { gt: 0 }], ['shipping fee', v.shipping], ['customs/duties', v.duties], ['clearing/agent fee', v.clearing], ['local transportation', v.transport], ['bank/payment charges', v.bank], ['other expenses', v.other], ['expected selling price per unit', v.price]]);
    if (e) return bad(e);
    const product = v.cost * v.qty;
    const hit = limitHit('import-landed-cost', product);
    if (hit) return hit;
    const extras = v.shipping + v.duties + v.clearing + v.transport + v.bank + v.other, landed = product + extras, perUnit = landed / v.qty;
    const hasPrice = v.price > 0, revenue = v.price * v.qty, profit = revenue - landed;
    return ok({ product, extras, landed, perUnit, hasPrice, revenue, profit, profitPer: profit / v.qty, margin: hasPrice ? profit / revenue * 100 : null, breakEven: perUnit });
  };

  /* ---- Handwork & service pricing. method: 'amount' | 'markup' | 'margin'. Every figure comes from the user. ---- */
  E.handwork = (v) => {
    let materials = 0;
    for (let i = 0; i < (v.materials || []).length; i++) {
      const r = v.materials[i];
      if (!['name', 'qty', 'cost'].some((k) => String(r[k] || '').trim() !== '')) continue;
      const name = String(r.name || '').trim() || `Material ${i + 1}`, qty = E.num(r.qty), cost = E.num(r.cost);
      const m = chk([[`quantity for ${name}`, qty, { gt: 0 }], [`cost for ${name}`, cost]]);
      if (m) return bad(m);
      materials += qty * cost;
    }
    const hourly = v.labourMode === 'hourly';
    const e = chk((hourly ? [['labour hours', v.hours], ['labour rate per hour', v.rate]] : [['labour cost', v.labour]]).concat([['transport cost', v.transport], ['electricity/fuel cost', v.fuel], ['packaging cost', v.packaging], ['other expenses', v.other], ['wastage/other cost', v.wastage], ['discount', v.discount, { max: 100 }]]));
    if (e) return bad(e);
    const labour = hourly ? v.hours * v.rate : v.labour, other = v.transport + v.fuel + v.packaging + v.other + v.wastage, total = materials + labour + other;
    if (!(total > 0)) return bad('Enter at least one cost: materials, labour or other costs.');
    const method = ['markup', 'margin'].includes(v.method) ? v.method : 'amount';
    const val = method === 'margin' ? v.margin : method === 'markup' ? v.markup : v.amount;
    const e2 = chk([[method === 'margin' ? 'desired profit margin' : method === 'markup' ? 'desired markup' : 'desired profit amount', val, { max: method === 'margin' ? 99.99 : method === 'markup' ? 100000 : 1e15 }]]);
    if (e2) return bad(e2);
    const price = method === 'margin' ? total / (1 - val / 100) : method === 'markup' ? total * (1 + val / 100) : total + val;
    const profit = price - total, after = price * (1 - v.discount / 100), profitAfter = after - total;
    return ok({ materials, labour, other, total, price, profit, margin: profit / price * 100, markup: profit / total * 100, breakEven: total, hasDiscount: v.discount > 0, discount: v.discount, after, profitAfter });
  };

  /* ---- Poultry / fish starters share one model. Feed is the TOTAL for the batch, entered by the user. ---- */
  const FARMS = {
    poultry: { id: 'poultry-starter', noun: 'bird', plural: 'birds', young: 'chick', med: 'medication/vaccination cost', ops: [['bedding', 'bedding/litter cost'], ['utilities', 'water/electricity cost'], ['labour', 'labour cost'], ['transport', 'transportation cost'], ['other', 'other expenses']] },
    fish: { id: 'fish-starter', noun: 'fish', plural: 'fish', young: 'fingerling', med: 'medication/treatment cost', ops: [['pond', 'pond preparation cost'], ['water', 'water cost'], ['power', 'electricity/pumping cost'], ['labour', 'labour cost'], ['transport', 'transportation cost'], ['other', 'other expenses']] }
  };
  function farm(c, v) {
    const e = chk([[`number of ${c.plural}`, v.count, { gt: 0 }], [`price per ${c.young}`, v.unitPrice], ['feed cost', v.feed], [c.med, v.med]].concat(c.ops.map(([id, l]) => [l, v[id]]), [[`selling price per ${c.noun}`, v.price, { gt: 0 }], ['mortality rate', v.mortality, { max: 99 }]]));
    if (e) return bad(e);
    if (!Number.isInteger(v.count)) return bad(`Number of ${c.plural} must be a whole number.`);
    const hit = limitHit(c.id, v.count);
    if (hit) return hit;
    const survivors = Math.floor(v.count * (100 - v.mortality) / 100 + 1e-9);
    if (survivors < 1) return bad(`That mortality rate leaves no surviving ${c.plural}. Please lower it.`);
    const purchase = v.count * v.unitPrice, other = c.ops.reduce((s, [id]) => s + v[id], 0), total = purchase + v.feed + v.med + other;
    const revenue = survivors * v.price, profit = revenue - total;
    return ok({ count: v.count, purchase, feed: v.feed, med: v.med, other, total, survivors, mortality: v.mortality, costPer: total / survivors, revenue, profit, profitPer: profit / survivors, breakEven: total / survivors, margin: profit / revenue * 100 });
  }
  E.poultry = (v) => farm(FARMS.poultry, v);
  E.fish = (v) => farm(FARMS.fish, v);

  // Named aliases used by the spec
  E.calculatePercentage = E.percentage; E.calculateProfit = E.profit; E.calculateDiscount = E.discount; E.calculateLoan = E.loan;
  E.calculateRetailPrice = E.retailPrice; E.calculateTargetProfit = E.targetProfit; E.calculateExpenses = E.expenses; E.calculateMultipleProducts = E.multipleProducts; E.calculateImportCost = E.importCost; E.calculatePoultry = E.poultry; E.calculateFish = E.fish; E.calculateHandwork = E.handwork;

  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.CalcEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
