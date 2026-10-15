(() => {
'use strict';
const E = window.CalcEngine;
let cur = 'NGN', redo = null;
const money = (n) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: cur }).format(n);
const pct = (n) => (n == null || !Number.isFinite(n) ? 'N/A' : n.toFixed(2) + '%');
const int = (n) => new Intl.NumberFormat('en-NG').format(n);
const $ = (id) => document.getElementById(id);
// Safe DOM builder: strings are always appended as text, never parsed as HTML.
const h = (t, a = {}, ...k) => {
  const e = document.createElement(t);
  for (const [x, y] of Object.entries(a)) x === 'class' ? (e.className = y) : x.startsWith('on') ? e.addEventListener(x.slice(2), y) : e.setAttribute(x, y);
  for (const c of k.flat()) if (c != null) e.append(c);
  return e;
};
const sgn = (n) => (n < 0 ? 'neg' : '');
const FREQ = [['monthly', 'Monthly'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']];
const UNIT = [['years', 'Years'], ['months', 'Months']];
const LOAN_NOTE = 'This is an estimate. Actual lender calculations may differ because of fees, taxes, insurance, compounding methods and other charges.';

const loanView = (label, table) => (r) => ({
  rows: [[label, money(r.payment)], ['Total repayment', money(r.total)], ['Total interest', money(r.interest)], ['Number of payments', int(r.n)]],
  table: table && { head: ['#', 'Principal', 'Interest', 'Balance'], body: r.schedule.map((s) => [String(s.no), money(s.principal), money(s.interest), money(s.balance)]) },
  note: LOAN_NOTE
});

const num = (id, label, ph, opt) => ({ id, label: label + (opt ? ' (optional)' : ''), ph, opt });
const sel = (id, label, opts) => ({ id, label, type: 'select', opts });

const CALCS = {
  percentage: {
    fields: [sel('mode', 'What do you want to find?', [['of', 'X% of Y'], ['change', 'Percentage increase or decrease'], ['difference', 'Percentage difference']]), num('a', 'First value (for X% of Y: the percentage X)', 'e.g. 20'), num('b', 'Second value (for X% of Y: the number Y)', 'e.g. 150')],
    run: (v) => E.percentage(v.mode, v.a, v.b),
    view: (r, v) => v.mode === 'of' ? { rows: [[`${v.a}% of ${v.b}`, int2(r.result)]] }
      : v.mode === 'change' ? { rows: [[r.direction === 'increase' ? 'Percentage increase' : r.direction === 'decrease' ? 'Percentage decrease' : 'No change', pct(Math.abs(r.percent)), r.direction === 'increase' ? 'good' : r.direction === 'decrease' ? 'bad' : ''], ['Change in value', int2(r.amount)]], note: 'Change is measured from the first value to the second.' }
      : { rows: [['Percentage difference', pct(r.percent)], ['Difference in value', int2(r.amount)]], note: 'Difference is relative to the average of the two values.' }
  },
  profit: {
    fields: [num('cost', 'Cost price', 'e.g. 800'), num('sell', 'Selling price', 'e.g. 1000')],
    run: (v) => E.profit(v.cost, v.sell),
    view: (r) => ({ rows: [[r.profit > 0 ? 'Profit' : r.profit < 0 ? 'Loss' : 'Break-even (no profit, no loss)', money(Math.abs(r.profit)), r.profit > 0 ? 'good' : r.profit < 0 ? 'bad' : ''], ['Profit margin', pct(r.margin), 'Share of the selling price that is profit'], ['Markup', pct(r.markup), 'Profit as a percentage of cost']] })
  },
  discount: {
    fields: [num('price', 'Original price', 'e.g. 10000'), num('pct', 'Discount (%)', 'e.g. 15')],
    run: (v) => E.discount(v.price, v.pct),
    view: (r) => ({ rows: [['Final price', money(r.final)], ['Discount amount', money(r.discount)], ['Amount saved', money(r.saved)]] })
  },
  'retail-pricing': {
    fields: [num('cost', 'Product cost', 'What you paid for one item'), num('expenses', 'Additional expenses per item', 'Transport, packaging, etc.', true), sel('mode', 'I want to set my price by', [['markup', 'Markup (% added on top of cost)'], ['margin', 'Profit margin (% of selling price)']]), num('value', 'Desired markup or margin (%)', 'e.g. 30'), num('discount', 'Discount to offer (%)', 'e.g. 10', true)],
    run: (v) => E.retailPrice({ cost: v.cost, expenses: v.expenses, mode: v.mode, value: v.value, discount: v.discount }),
    view: (r, v) => ({ rows: [['Recommended selling price', money(r.price)], ['Total cost per item', money(r.base)], ['Expected profit per item', money(r.profit), r.profit >= 0 ? 'good' : 'bad'], ['Profit margin', pct(r.margin)], ['Markup', pct(r.markup)]].concat(v.discount > 0 ? [[`Price after ${v.discount}% discount`, money(r.after)], ['Profit after discount', money(r.profitAfter), r.profitAfter >= 0 ? 'good' : 'bad']] : []), note: r.profitAfter < 0 ? 'Warning: after this discount you would sell below cost.' : '' })
  },
  'target-profit': {
    fields: [num('cost', 'Cost per product', 'What one item costs you'), num('profit', 'Profit you want to make', 'e.g. 100000'), num('fixed', 'Fixed expenses (rent, transport, etc.)', 'e.g. 20000', true), num('units', 'Units you expect to sell', 'e.g. 200', true), num('price', 'Your selling price, if you already have one', 'Use this if you left units empty', true)],
    run: (v) => E.targetProfit({ cost: v.cost, profit: v.profit, fixed: v.fixed, units: v.units, price: v.price }),
    view: (r) => ({ rows: [r.mode === 'price' ? ['Price you must charge per item', money(r.price)] : ['Items you must sell', int(r.units)], ['Revenue needed', money(r.revenue)], ['Total costs', money(r.totalCost)], ['Expected profit', money(r.profit), 'good']].concat(r.mode === 'units' ? [['At selling price', money(r.price)]] : [['Items to sell', int(r.units)]]) })
  },
  'business-expenses': {
    fields: [{ id: 'items', type: 'rows', add: 'Add expense', cols: [{ id: 'name', label: 'Expense', ph: 'Name' }, { id: 'amount', label: 'Monthly amount', ph: '0', num: 1 }], init: ['Rent', 'Transport', 'Electricity', 'Staff', 'Packaging', 'Marketing', 'Internet', 'Delivery', 'Other'].map((n) => ({ name: n })) }],
    run: (v) => E.expenses(v.items),
    view: (r) => ({ rows: [['Total monthly expenses', money(r.monthly)], ['Yearly projection (× 12)', money(r.yearly)]], table: { head: ['Expense', 'Monthly', 'Share'], body: r.items.map((x) => [x.name, money(x.amount), pct(x.share)]) } })
  },
  'multiple-products': {
    fields: [{ id: 'items', type: 'rows', add: 'Add product', cols: [{ id: 'name', label: 'Product', ph: 'Name', span: 1 }, { id: 'qty', label: 'Quantity', ph: '0', num: 1 }, { id: 'cost', label: 'Cost price (each)', ph: '0', num: 1 }, { id: 'sell', label: 'Selling price (each)', ph: '0', num: 1 }], init: [{}, {}, {}] }],
    run: (v) => E.multipleProducts(v.items),
    view: (r) => ({ rows: [[r.totalProfit >= 0 ? 'Total profit' : 'Total loss', money(Math.abs(r.totalProfit)), r.totalProfit >= 0 ? 'good' : 'bad'], ['Total cost', money(r.totalCost)], ['Total sales', money(r.totalSales)], ['Overall profit margin', pct(r.margin)], ['Total units', int(r.units)]], table: { head: ['Product', 'Qty', 'Cost', 'Sales', 'Profit/Loss'], body: r.items.map((x) => [x.name, int(x.qty), money(x.cost), money(x.sales), [money(x.profit), sgn(x.profit)]]) } })
  },
  'import-landed-cost': {
    ngnOnly: true,
    fields: [num('cost', 'Product cost per unit', 'e.g. 3000'), num('qty', 'Quantity', 'e.g. 100'), num('shipping', 'Shipping fee', 'Total for the shipment', true), num('duties', 'Customs/duties', 'Total you paid or expect to pay', true), num('clearing', 'Clearing/agent fee', 'e.g. 15000', true), num('transport', 'Local transportation', 'Port to your shop or store', true), num('bank', 'Bank/payment charges', 'e.g. 5000', true), num('other', 'Other expenses', 'e.g. 7000', true), num('price', 'Expected selling price per unit', 'Leave empty to see costs only', true)],
    run: (v) => E.importCost(v),
    view: (r) => ({ rows: [['Total landed cost', money(r.landed)], ['Landed cost per unit', money(r.perUnit)], ['Total product cost', money(r.product)], ['Total additional costs', money(r.extras)]].concat(r.hasPrice ? [['Expected revenue', money(r.revenue)], [r.profit >= 0 ? 'Expected profit' : 'Expected loss', money(r.profit), r.profit >= 0 ? 'good' : 'bad'], ['Profit per unit', money(r.profitPer), r.profitPer >= 0 ? 'good' : 'bad'], ['Profit margin', pct(r.margin)]] : []).concat([['Break-even selling price per unit', money(r.breakEven)]]), note: 'Estimated based on the figures you entered. This calculator does not know current customs, shipping or market prices.' + (r.hasPrice ? '' : ' Add an expected selling price to see profit.') })
  },
  'handwork-pricing': {
    fields: [
      { id: 'materials', type: 'rows', title: 'Materials (leave empty if you use none)', add: 'Add material', cols: [{ id: 'name', label: 'Material', ph: 'e.g. Ankara fabric', span: 1 }, { id: 'qty', label: 'Quantity', ph: '0', num: 1 }, { id: 'cost', label: 'Cost each', ph: '0', num: 1 }], init: [{}, {}] },
      sel('labourMode', 'How do you count your labour?', [['total', 'One total amount'], ['hourly', 'Hours × rate per hour']]),
      { ...num('labour', 'Total labour cost', 'e.g. 8000', true), showIf: { id: 'labourMode', value: 'total' } },
      { ...num('hours', 'Labour hours', 'e.g. 8', true), showIf: { id: 'labourMode', value: 'hourly' } },
      { ...num('rate', 'Labour rate per hour', 'e.g. 1000', true), showIf: { id: 'labourMode', value: 'hourly' } },
      num('transport', 'Transport', 'e.g. 1000', true), num('fuel', 'Electricity/fuel', 'e.g. 500', true), num('packaging', 'Packaging', 'e.g. 300', true), num('other', 'Other expenses', 'e.g. 500', true), num('wastage', 'Wastage/other cost', 'Material lost or spoiled, e.g. 800', true),
      sel('method', 'How do you want to set your profit?', [['amount', 'A fixed profit amount'], ['markup', 'Markup: % added on top of my total cost'], ['margin', 'Profit margin: % of the selling price']]),
      { ...num('amount', 'Profit you want to make', 'e.g. 3000'), showIf: { id: 'method', value: 'amount' } },
      { ...num('markup', 'Markup (%)', 'e.g. 25'), showIf: { id: 'method', value: 'markup' } },
      { ...num('margin', 'Profit margin (%)', 'e.g. 30'), showIf: { id: 'method', value: 'margin' } },
      num('discount', 'Discount to offer (%)', 'e.g. 10', true)
    ],
    run: (v) => E.handwork(v),
    view: (r) => ({ rows: [['Recommended selling price', money(r.price)], ['Total material cost', money(r.materials)], ['Labour cost', money(r.labour)], ['Other costs', money(r.other)], ['Total cost', money(r.total)], ['Expected profit', money(r.profit), r.profit >= 0 ? 'good' : 'bad'], ['Profit margin (of selling price)', pct(r.margin)], ['Markup (on total cost)', pct(r.markup)], ['Break-even (minimum) price', money(r.breakEven)]].concat(r.hasDiscount ? [[`Price after ${r.discount}% discount`, money(r.after)], ['Profit after discount', money(r.profitAfter), r.profitAfter >= 0 ? 'good' : 'bad']] : []), note: (r.profitAfter < 0 && r.hasDiscount ? 'Warning: after this discount you would charge less than your total cost. ' : '') + 'Estimated based on the figures you entered. Margin and markup are different: margin is measured against the selling price, markup against your cost.' })
  },
  'poultry-starter': {
    fields: [num('count', 'Number of chicks/birds', 'e.g. 30'), num('unitPrice', 'Price per chick', 'e.g. 1200'), num('feed', 'Total feed cost for the batch', 'e.g. 90000'), num('med', 'Medication/vaccination', 'e.g. 6000', true), num('bedding', 'Bedding/litter', 'e.g. 3000', true), num('utilities', 'Water/electricity', 'e.g. 4000', true), num('labour', 'Labour', 'e.g. 10000', true), num('transport', 'Transportation', 'e.g. 2000', true), num('other', 'Other expenses', 'e.g. 1000', true), num('price', 'Expected selling price per bird', 'e.g. 7500'), num('mortality', 'Expected mortality rate (%)', 'e.g. 5. Empty means 0%', true)],
    run: (v) => E.poultry(v),
    view: farmView({ plural: 'birds', noun: 'bird', purchase: 'Chick purchase cost', med: 'Medication/vaccination cost' })
  },
  'fish-starter': {
    fields: [num('count', 'Number of fingerlings', 'e.g. 80'), num('unitPrice', 'Price per fingerling', 'e.g. 50'), num('feed', 'Total feed cost for the batch', 'e.g. 60000'), num('med', 'Medication/treatment', 'e.g. 3000', true), num('pond', 'Pond preparation', 'e.g. 20000', true), num('water', 'Water', 'e.g. 2000', true), num('power', 'Electricity/pumping', 'e.g. 5000', true), num('labour', 'Labour', 'e.g. 10000', true), num('transport', 'Transportation', 'e.g. 2000', true), num('other', 'Other expenses', 'e.g. 1000', true), num('price', 'Expected selling price per fish', 'e.g. 1500'), num('mortality', 'Expected mortality rate (%)', 'e.g. 10. Empty means 0%', true)],
    run: (v) => E.fish(v),
    view: farmView({ plural: 'fish', noun: 'fish', purchase: 'Fingerling purchase cost', med: 'Treatment/medication cost' })
  },
  loan: {
    fields: [num('principal', 'Loan amount', 'e.g. 1000000'), num('rate', 'Annual interest rate (%)', 'e.g. 12'), num('term', 'Loan duration', 'e.g. 12'), sel('unit', 'Duration in', [['months', 'Months'], ['years', 'Years']])],
    run: (v) => E.loan({ principal: v.principal, rate: v.rate, term: v.term, unit: v.unit, freq: 'monthly' }),
    view: loanView('Monthly payment', false)
  },
  'loan-repayment': {
    fields: [num('principal', 'Principal (loan amount)', 'e.g. 1000000'), num('rate', 'Annual interest rate (%)', 'e.g. 12'), num('term', 'Loan term', 'e.g. 1'), sel('unit', 'Term in', UNIT), sel('freq', 'Payment frequency', FREQ)],
    run: (v) => E.loan({ principal: v.principal, rate: v.rate, term: v.term, unit: v.unit, freq: v.freq }),
    view: loanView('Payment amount', true)
  }
};
const GLOSS = {
  "Percentage": "A part out of every 100. 20% of ₦150 means 20 out of each 100, which is ₦30.",
  "Labour cost": "The value of the time spent on the job: your own time, or what you pay workers.",
  "Wastage": "Material that is lost, spoiled or cut off and cannot be sold, such as cloth offcuts or burnt batches.",
  "Percentage change": "How much a number went up or down compared with where it started. Going from ₦100 to ₦125 is a 25% increase.",
  "Percentage difference": "How far apart two numbers are, compared with their average. It does not matter which number you type first.",
  "Cost price": "What you paid to get one item.",
  "Selling price": "What your customer pays you for one item.",
  "Profit": "The money left after you take away what the item cost you. Cost ₦800 and sold for ₦1,000 means ₦200 profit.",
  "Loss": "When you sell for less than it cost you. Cost ₦1,000 and sold for ₦800 is a ₦200 loss.",
  "Markup": "The percentage you add on top of your cost to get your selling price. Cost ₦1,000 with 30% markup means you sell for ₦1,300.",
  "Profit margin": "How much of the selling price is profit. Selling at ₦1,300 with ₦300 profit is about a 23% margin. For the same price, margin is always smaller than markup.",
  "Discount": "A reduction from the normal price. 10% off ₦5,000 takes off ₦500, so the customer pays ₦4,500.",
  "Additional expenses": "Other costs for each item besides what you bought it for, such as transport, packaging or delivery.",
  "Revenue": "All the money customers pay you, before you take away any costs. It is also called sales.",
  "Break-even": "The price, or amount sold, where you make no profit and no loss. You just get your money back.",
  "Fixed expenses": "Costs you pay every month no matter how much you sell, such as shop rent or staff pay.",
  "Yearly projection": "A rough guess of the whole year: your monthly total multiplied by 12.",
  "Principal": "The amount you borrow, before any interest is added.",
  "Interest rate": "The extra cost of borrowing, shown as a percentage per year. A 12% rate means about ₦12 a year for every ₦100 you owe.",
  "Total interest": "All the extra money you pay the lender on top of the amount you borrowed.",
  "Remaining balance": "How much you still owe after a payment.",
  "Landed cost": "The full cost of getting your goods to your shop: the product price plus shipping, customs, clearing, transport and charges.",
  "Customs/duties": "Tax charged by government when goods come into the country.",
  "Clearing/agent fee": "What an agent charges to take your goods through the port and release them to you.",
  "Mortality rate": "The percentage of birds or fish you expect to die before selling. At 5%, about 5 out of every 100 will die.",
  "Fingerlings": "Baby fish that are bought to grow in a pond."
};
const TERMS = {
  percentage: ["Percentage", "Percentage change", "Percentage difference"],
  profit: ["Cost price", "Selling price", "Profit", "Loss", "Profit margin", "Markup"],
  discount: ["Discount"],
  "retail-pricing": ["Additional expenses", "Markup", "Profit margin", "Profit", "Discount"],
  "target-profit": ["Fixed expenses", "Revenue", "Profit", "Selling price"],
  "business-expenses": ["Fixed expenses", "Yearly projection"],
  "multiple-products": ["Revenue", "Profit", "Loss", "Profit margin"],
  "handwork-pricing": ["Labour cost", "Wastage", "Markup", "Profit margin", "Break-even"],
  loan: ["Principal", "Interest rate", "Total interest"],
  "loan-repayment": ["Principal", "Interest rate", "Total interest", "Remaining balance"],
  "import-landed-cost": ["Landed cost", "Customs/duties", "Clearing/agent fee", "Revenue", "Profit margin", "Break-even"],
  "poultry-starter": ["Mortality rate", "Revenue", "Profit", "Break-even"],
  "fish-starter": ["Fingerlings", "Mortality rate", "Revenue", "Profit", "Break-even"]
};
function glossary(id) {
  const box = $('gl'), t = TERMS[id]; box.replaceChildren();
  if (t) box.append(h('details', { class: 'gl' }, h('summary', {}, 'New to these words? Tap for simple meanings'), h('dl', {}, t.flatMap((k) => [h('dt', {}, k), h('dd', {}, GLOSS[k])]))));
}
function farmView(t) {
  return (r) => ({
    rows: [[r.profit >= 0 ? 'Expected profit' : 'Expected loss', money(Math.abs(r.profit)), r.profit >= 0 ? 'good' : 'bad'], [t.purchase, money(r.purchase)], ['Estimated feed cost', money(r.feed)], [t.med, money(r.med)], ['Other operating costs', money(r.other)], ['Total estimated production cost', money(r.total)], [`Surviving ${t.plural} (rounded down)`, int(r.survivors)], [`Estimated cost per surviving ${t.noun}`, money(r.costPer)], ['Expected revenue', money(r.revenue)], [`Estimated profit per ${t.noun}`, money(r.profitPer), r.profitPer >= 0 ? 'good' : 'bad'], [`Break-even selling price per ${t.noun}`, money(r.breakEven)]],
    note: `Estimated result based on your inputs and assumptions. Assumptions: ${int(r.count)} ${t.plural} bought, ${r.mortality}% mortality, so ${int(r.survivors)} are expected to survive. Revenue counts only surviving ${t.plural}. Feed is the total you entered for the whole batch.`
  });
}
function int2(n) { return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(n); }

/* ---------- Form + results ---------- */
function rowEl(f, data) {
  const e = h('div', { class: 'item' + (f.cols.length === 2 ? ' c1' : '') });
  f.cols.forEach((c) => {
    const id = 'r' + Math.random().toString(36).slice(2, 8);
    const inp = h('input', { id, 'data-k': c.id, type: 'text', placeholder: c.ph, autocomplete: 'off' });
    if (c.num) inp.setAttribute('inputmode', 'decimal');
    if (data && data[c.id]) inp.value = data[c.id];
    e.append(h('div', c.span ? { class: 'span' } : {}, h('label', { for: id }, c.label), inp));
  });
  e.append(h('button', { type: 'button', class: 'x', 'aria-label': 'Remove row', onclick: () => { if (e.parentNode.children.length > 1) e.remove(); } }, 'Remove'));
  return e;
}

function renderCalc(id) {
  const meta = E.registry.find((c) => c.id === id), def = CALCS[id];
  document.title = `${meta.name} – UnaabzCalc`;
  const md = document.querySelector('meta[name=description]'); md.setAttribute('content', `${meta.description} Free ${meta.name.toLowerCase()} from UnaabzCalc.`);
  $('ct').textContent = (meta.icon ? meta.icon + ' ' : '') + meta.name; $('cd').textContent = meta.description;
  $('cl').hidden = !meta.free_limit; $('cl').textContent = meta.free_limit ? meta.free_limit.label : '';
  glossary(id);
  const body = $('cb'); body.replaceChildren(); redo = null;
  if (id === 'basic') return basic(body);
  if (!E.canAccess(meta)) { body.append(h('div', { class: 'card' }, 'This calculator is part of Premium, coming soon.')); return; }

  const form = h('form', { class: 'card', novalidate: '' }), res = h('div', { class: 'card res', 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status', hidden: '' });
  const err = h('p', { class: 'err', role: 'alert' });
  const holders = {}, wraps = {};
  for (const f of def.fields) {
    if (f.type === 'rows') {
      const list = h('div'); holders[f.id] = list; f.init.forEach((d) => list.append(rowEl(f, d)));
      form.append(h('div', { class: 'lab' }, f.title || 'Enter your ' + (f.add.includes('product') ? 'products' : 'expenses')), list, h('button', { type: 'button', class: 'btn o', style: 'margin-top:10px;width:100%', onclick: () => list.append(rowEl(f)) }, f.add));
    } else if (f.type === 'select') {
      holders[f.id] = h('select', { id: 'f_' + f.id }, f.opts.map(([v, l]) => h('option', { value: v }, l)));
      wraps[f.id] = h('div', {}, h('label', { for: 'f_' + f.id }, f.label), holders[f.id]); form.append(wraps[f.id]);
    } else {
      holders[f.id] = h('input', { id: 'f_' + f.id, type: 'text', inputmode: 'decimal', placeholder: f.ph, autocomplete: 'off' });
      wraps[f.id] = h('div', {}, h('label', { for: 'f_' + f.id }, f.label), holders[f.id]); form.append(wraps[f.id]);
    }
  }
  // Progressive disclosure: show only the fields that belong to the chosen option.
  for (const f of def.fields) if (f.showIf) { const ctl = holders[f.showIf.id], upd = () => { wraps[f.id].hidden = ctl.value !== f.showIf.value; }; ctl.addEventListener('change', upd); upd(); }
  const reset = h('button', { type: 'button', class: 'btn o' }, 'Reset');
  form.append(err, h('div', { class: 'acts' }, h('button', { type: 'submit', class: 'btn g' }, 'Calculate'), reset));

  const read = () => {
    const v = {};
    for (const f of def.fields) {
      if (f.type === 'rows') v[f.id] = [...holders[f.id].children].map((row) => Object.fromEntries([...row.querySelectorAll('input')].map((i) => [i.dataset.k, i.value])));
      else if (f.type === 'select') v[f.id] = holders[f.id].value;
      else { const raw = holders[f.id].value.trim(); v[f.id] = f.opt && raw === '' ? 0 : E.num(raw); }
    }
    return v;
  };
  const run = () => {
    const v = read(), r = def.ngnOnly && cur !== 'NGN' ? { ok: false, error: 'The Free version of this calculator works in Naira (NGN). Please switch the currency to NGN.' } : def.run(v);
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    if (r.premium) { err.textContent = ''; showPremium(res, r); return; }
    if (!r.ok) { err.textContent = r.error; res.hidden = true; const bad = def.fields.find((f) => f.type !== 'rows' && f.type !== 'select' && !Number.isFinite(v[f.id]) && !wraps[f.id].hidden); if (bad) { holders[bad.id].setAttribute('aria-invalid', 'true'); holders[bad.id].focus(); } return; }
    err.textContent = '';
    showResult(res, def.view(r, v), meta.name);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); run(); redo = run; });
  reset.addEventListener('click', () => renderCalc(id));
  body.append(form, res);
  const first = form.querySelector('input'); if (first && matchMedia('(min-width:700px)').matches) first.focus();
}

function showPremium(box, r) {
  box.replaceChildren(); box.hidden = false;
  box.append(h('div', { class: 'prem' }, h('h2', {}, 'Above the Free version limit'), h('p', {}, r.message), h('p', { class: 'note' }, r.limit + '. Everything under this limit is fully calculated for free.')));
}
// Share is user-initiated: nothing is sent anywhere unless the person taps the button.
async function share(name, v, msg) {
  const site = location.protocol.startsWith('http') ? location.origin : '';
  const text = [name, ''].concat(v.rows.map(([k, val]) => `${k}: ${val}`), ['', 'Calculated with UnaabzCalc. Calculate Better. Sell Smarter.' + (site ? ' ' + site : '')]).join('\n');
  try { if (navigator.share) { await navigator.share({ title: name, text }); msg.textContent = ''; return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); msg.textContent = 'Result copied. Paste it into WhatsApp or any chat.'; }
  catch (e) { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener'); }
}
function showResult(box, v, name) {
  box.replaceChildren(); box.hidden = false;
  v.rows.forEach(([k, val, cls], i) => {
    if (i === 0) box.append(h('div', { class: 'hero-r ' + (cls || '') }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, val)));
    else box.append(h('div', { class: 'row ' + (cls === 'good' || cls === 'bad' ? cls : '') }, h('span', {}, k), h('b', {}, val)));
  });
  if (v.table) box.append(h('div', { class: 'tw', tabindex: '0', role: 'region', 'aria-label': 'Results table' }, h('table', {}, h('thead', {}, h('tr', {}, v.table.head.map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, v.table.body.map((r) => h('tr', {}, r.map((c) => Array.isArray(c) ? h('td', { class: c[1] }, c[0]) : h('td', {}, c))))))));
  if (v.note) box.append(h('p', { class: 'note' }, v.note));
  const msg = h('p', { class: 'note', role: 'status' });
  box.append(h('button', { type: 'button', class: 'btn o', style: 'margin-top:14px;width:100%', onclick: () => share(name, v, msg) }, 'Share result'), msg);
}

/* ---------- Basic calculator ---------- */
function basic(body) {
  const disp = h('input', { id: 'disp', type: 'text', readonly: '', 'aria-label': 'Calculation', value: '' });
  const hist = h('div', { class: 'hist', role: 'status', 'aria-live': 'polite' });
  const err = h('p', { class: 'err', role: 'alert' });
  let done = false;
  const add = (c) => { if (done && /[\d.(]/.test(c)) disp.value = ''; done = false; err.textContent = ''; disp.value += c; };
  const eq = () => { const r = E.basic(disp.value); if (!r.ok) { err.textContent = r.error; return; } hist.textContent = disp.value + ' ='; disp.value = String(r.value); done = true; };
  const act = (k) => {
    if (k === 'C') { disp.value = ''; hist.textContent = ''; err.textContent = ''; done = false; }
    else if (k === '⌫') { disp.value = disp.value.slice(0, -1); err.textContent = ''; }
    else if (k === '=') eq(); else add(k);
  };
  const layout = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '(', ')', '='];
  const keys = h('div', { class: 'keys' }, layout.map((k) => h('button', { type: 'button', class: k === '=' ? 'eq' : '+−×÷%C⌫'.includes(k) ? 'op' : '', 'aria-label': { '⌫': 'Delete', C: 'Clear', '÷': 'Divide', '×': 'Multiply', '−': 'Subtract', '+': 'Add', '%': 'Percent', '=': 'Equals', '.': 'Decimal point', '(': 'Open bracket', ')': 'Close bracket' }[k] || k, onclick: () => act(k) }, k)));
  body.append(h('div', { class: 'card' }, hist, disp, err, keys, h('p', { class: 'note' }, 'Percent works like a phone calculator: 50 + 10% = 55 and 200 − 10% = 180. With × or ÷, 10% means 0.1, so 200 × 10% = 20. You can also use your keyboard.')));
  window.__kb = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const m = { '*': '×', '/': '÷', '-': '−' }, k = e.key;
    if (/^[\d.+()%]$/.test(k) || m[k]) add(m[k] || k);
    else if (k === 'Enter' || k === '=') eq(); else if (k === 'Backspace') act('⌫'); else if (k === 'Escape' || k.toLowerCase() === 'c') act('C'); else return;
    e.preventDefault();
  };
}
document.addEventListener('keydown', (e) => { if (location.hash === '#/calc/basic' && window.__kb && !/^(BUTTON|SELECT)$/.test(e.target.tagName)) window.__kb(e); });

/* ---------- Home + router ---------- */
function renderHome() {
  $('fc').textContent = E.registry.filter((c) => c.access === 'free').length;
  const cats = $('cats'); cats.replaceChildren();
  for (const [key, label] of Object.entries(E.categories)) {
    cats.append(h('h3', { style: 'margin-top:24px' }, label), h('div', { class: 'grid' }, E.registry.filter((c) => c.category === key).map((c) => h('a', { class: 'tile', href: '#/calc/' + c.id }, h('h3', {}, (c.icon ? c.icon + ' ' : '') + c.name), h('p', {}, c.description), h('span', { class: 'tag' }, c.access === 'free' ? 'Free' : 'Premium'), c.free_limit ? h('p', { class: 'note' }, c.free_limit.label) : null))));
  }
}
function route() {
  const hash = location.hash.replace(/^#\/?/, ''), m = /^calc\/([\w-]+)$/.exec(hash);
  const calc = m && E.registry.find((c) => c.id === m[1]);
  $('home').hidden = !!calc; $('calc').hidden = !calc;
  if (calc) { renderCalc(calc.id); scrollTo(0, 0); return; }
  document.title = 'UnaabzCalc – Free Business Calculators for Nigerian Vendors';
  const t = ['calculators', 'pricing', 'about'].includes(hash) ? $(hash) : null;
  t ? t.scrollIntoView() : scrollTo(0, 0);
}
$('cur').addEventListener('change', (e) => { cur = e.target.value; if (redo) redo(); });
renderHome(); addEventListener('hashchange', route); route();
})();
